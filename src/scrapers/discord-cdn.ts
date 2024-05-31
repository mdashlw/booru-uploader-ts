import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return url.hostname === "cdn.discordapp.com";
}

export async function scrape(url: URL): Promise<SourceData> {
  const cleanUrl = new URL(url);
  cleanUrl.search = "";

  const lastModifiedString = await undici
    .request(url, {
      method: "HEAD",
      throwOnError: true,
    })
    .then((response) => response.headers["last-modified"]);
  if (typeof lastModifiedString !== "string") {
    throw new Error(`Invalid last-modified header: ${lastModifiedString}`);
  }
  const lastModified = new Date(lastModifiedString);

  return {
    source: "Discord",
    url: cleanUrl.toString(),
    images: [await probeImageUrl(url)],
    artist: null,
    date: formatDate(lastModified),
    title: null,
    description: null,
  };
}
