import * as cheerio from "cheerio";
import undici from "undici";
import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

export function canHandle(url: URL): boolean {
  return url.hostname === "tabun.everypony.ru";
}

export async function scrape(url: URL): Promise<SourceData> {
  const $ = await fetchPage(url);

  return {
    source: "Tabun",
    url: $('link[rel="canonical"]').attr("href")!,
    images: await Promise.all(
      $(".topic-content img")
        .map((_, img) => $(img).attr("src"))
        .toArray()
        .map(async (url) => {
          if (url.startsWith("//")) {
            url = `https:${url}`;
          }

          return await probeImageUrl(url);
        }),
    ),
    artist: $('.topic-info a[rel="author"]').text(),
    date: new Date($(".topic-info-date time").attr("datetime")!),
    title: $(".topic-title").text(),
    description: null,
  };
}

async function fetchPage(url: URL): Promise<cheerio.CheerioAPI> {
  const response = await undici
    .request(url, {
      maxRedirections: 1,
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.url = url;
      throw error;
    });
  const body = await response.body.text().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.url = url;
    error.response = response;
    throw error;
  });

  return cheerio.load(body);
}
