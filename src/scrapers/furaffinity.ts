import * as cheerio from "cheerio";
import process from "node:process";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

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

  return {
    source: "FurAffinity",
    url: $("meta[property='og:url']").attr("content")!,
    images: [
      {
        url: "https:" + $(".download > a").attr("href"),
        width,
        height,
      },
    ],
    artist: $(".submission-id-sub-container > a > strong").text(),
    date: formatDate(
      new Date(
        $(".submission-id-sub-container > strong > span").attr("title") +
          " UTC",
      ),
    ),
    title: $(".submission-title").text().trim(),
    description: $(".submission-description").text().trim(),
  };
}
