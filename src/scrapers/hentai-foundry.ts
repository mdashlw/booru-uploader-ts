import * as cheerio from "cheerio";
import undici from "undici";
import type { SourceData } from "../scraper/types.ts";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

const BASE_URL = "https://www.hentai-foundry.com";

const pool = new undici.Pool(BASE_URL);
let PHPSESSID: string | undefined;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "www.hentai-foundry.com" ||
    url.hostname === "hentai-foundry.com"
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  let pid: string;

  if (url.pathname.startsWith("/pictures/user/")) {
    pid = url.pathname.split("/")[4];
  } else if (url.pathname.startsWith("/pictures/")) {
    pid = url.pathname.split("/")[2];
  } else if (
    url.pathname.startsWith("/pic-") ||
    url.pathname.startsWith("/pic_")
  ) {
    pid = url.pathname.split("/")[1].split(".")[0].split("-")[1];
  } else {
    throw new Error("invalid url");
  }

  const $ = await fetchHtml(url.pathname);

  return {
    source: "Hentai Foundry",
    url: BASE_URL + $("#FilterBox .boxbody > form").attr("action"),
    images: [
      await probeImageUrl("https:" + $("#picBox .boxbody > img").attr("src")!),
    ],
    artist: $("#picBox .imageTitle ~ a").text(),
    date: new Date($("#pictureGeneralInfoBox .boxbody time").attr("datetime")!),
    title: $("#picBox .imageTitle").text(),
    description: (booru) => {
      let description = convertHtmlToMarkdown(
        $("#descriptionBox .boxbody > .picDescript").html()!,
        booru.markdown,
      );

      const tags = $(
        "#pictureGeneralInfoBox .boxbody .tagsContainer > .tag > .tagLink",
      )
        .map((_, el) => $(el).text())
        .get();

      if (tags.length) {
        if (description) {
          description += "\n\n";
        }

        description += tags.map((tag) => `#${tag}`).join(" ");
      }

      return description;
    },
  };
}

async function fetchHtml(path: string) {
  while (true) {
    const response = await pool.request({
      method: "GET",
      path: PHPSESSID === undefined ? `${path}?enterAgree=1` : path,
      headers: {
        cookie: `PHPSESSID=${PHPSESSID}`,
      },
      throwOnError: true,
    });

    if ("set-cookie" in response.headers) {
      const setCookies = undici.getSetCookies(
        new undici.Headers({ "set-cookie": response.headers["set-cookie"]! }),
      );

      const setPHPSESSID = setCookies.find(
        ({ name }) => name === "PHPSESSID",
      )?.value;

      if (setPHPSESSID !== undefined) {
        if (PHPSESSID === undefined) {
          PHPSESSID = setPHPSESSID;
        } else {
          PHPSESSID = undefined;
          continue;
        }
      }
    }

    if (response.statusCode === 301) {
      const location = response.headers.location;

      if (location === undefined) {
        throw new Error("no location header");
      }

      if (typeof location !== "string") {
        throw new Error("invalid location header");
      }

      if (location.startsWith("/")) {
        path = location;
      } else {
        const locationUrl = new URL(location);

        if (locationUrl.origin !== BASE_URL) {
          throw new Error("invalid location origin");
        }

        path = locationUrl.pathname;
      }

      continue;
    }

    const html = await response.body.text();
    const $ = cheerio.load(html);

    return $;
  }
}
