import * as cheerio from "cheerio";
import undici from "undici";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.ts";
import { getCookieString } from "../cookies.ts";

const BASE_URL = "https://www.furaffinity.net";

export function canHandle(url: URL): boolean {
  return url.hostname === "www.furaffinity.net";
}

export async function scrape(url: URL): Promise<SourceData> {
  url.protocol = "https:";
  const response = await undici.request(url, {
    headers: {
      cookie: getCookieString(`${BASE_URL}/`),
    },
    throwOnError: true,
    maxRedirections: 1,
  });

  if ("set-cookie" in response.headers) {
    throw new Error("Invalid Fur Affinity cookies");
  }

  const body = await response.body.text();
  const $ = cheerio.load(body);

  const [width, height] = $(
    ".submission-sidebar > .info > div:nth-child(4) > span",
  )
    .text()
    .split(" x ")
    .map(Number);

  const imageUrl = "https:" + $(".download > a").attr("href");

  $(".submission-footer").remove();

  return {
    source: "Fur Affinity",
    url: $("meta[property='og:url']").attr("content")!,
    images: [
      await probeAndValidateImageUrl(imageUrl, undefined, width, height),
    ],
    artist: $(".submission-id-sub-container > a > strong").text(),
    date: new Date(Number(new URL(imageUrl).pathname.split("/")[3]) * 1_000),
    title: $(".submission-title").text().trim(),
    description: (booru) =>
      convertHtmlToMarkdown(
        $(".submission-description").html()!,
        booru.markdown,
        "https://www.furaffinity.net",
      ),
    tags: $(".tags-row .tags a:not(.tag-block)")
      .map((_, el) => ({
        name: $(el).text().trim(),
        url: BASE_URL + encodeURI($(el).attr("href")!),
      }))
      .toArray(),
  };
}
