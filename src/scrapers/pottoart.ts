import type { SourceData } from "../scraper/types.ts";
import { formatDate } from "../scraper/utils.ts";
import { probeImageUrl } from "../utils/probe-image.ts";
import undici from "undici";

export function canHandle(url: URL): boolean {
  return url.hostname === "gallery.pottoart.uk";
}

export async function scrape(url: URL): Promise<SourceData> {
  const response = await undici.request(url, {
    method: "HEAD",
    throwOnError: true,
  });
  const lastModified = response.headers["x-bz-info-src_last_modified_millis"];

  if (typeof lastModified !== "string") {
    throw new Error("invalid x-bz-info-src_last_modified_millis header");
  }

  return {
    source: "Potto",
    url: url.href,
    images: [await probeImageUrl(url)],
    artist: "potato22",
    date: formatDate(new Date(Number(lastModified))),
    title: null,
    description: null,
  };
}
