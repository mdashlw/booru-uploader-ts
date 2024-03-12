import * as cheerio from "cheerio";
import process from "node:process";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";

// Cookie for UTC time and NSFW.
// Make sure time zone is set to Greenwich Mean Time and Daylight saving time correction is disabled.
// https://www.furaffinity.net/controls/settings/
const COOKIE = process.env.FURAFFINITY_COOKIE;

export function canHandle(url: URL): boolean {
  return url.hostname === "www.furaffinity.net";
}

export async function scrape(url: URL): Promise<SourceData> {
  const response = await undici.request(url, {
    headers: {
      cookie: COOKIE,
    },
    throwOnError: true,
    maxRedirections: 1,
  });

  if ("set-cookie" in response.headers) {
    throw new Error(`Invalid cookies: ${COOKIE}`);
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
  let description = $(".submission-description").text().trim();

  const tags = $(".tags-row .tags")
    .map((_, el) => $(el).text().trim())
    .toArray();

  if (tags.length) {
    if (description) {
      description += "\n\n";
    }

    description += tags.map((tag) => `#${tag}`).join(" ");
  }

  return {
    source: "FurAffinity",
    url: $("meta[property='og:url']").attr("content")!,
    images: [
      await probeAndValidateImageUrl(imageUrl, undefined, width, height),
    ],
    artist: $(".submission-id-sub-container > a > strong").text(),
    date: formatDate(
      new Date(
        $(".submission-id-sub-container > strong > span").attr("title") +
          " UTC",
      ),
    ),
    title: $(".submission-title").text().trim(),
    description,
  };
}
