import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return url.hostname === "cdn.discordapp.com";
}

export async function scrape(url: URL): Promise<SourceData> {
  const exString = url.searchParams.get("ex");

  if (exString === null) {
    throw new Error("unsigned url");
  }

  const exSeconds = Number.parseInt(exString, 16);

  if (Number.isNaN(exSeconds)) {
    throw new Error("invalid ex value in url");
  }

  const exMillis = exSeconds * 1_000;

  if (Date.now() > exMillis) {
    throw new Error("expired url");
  }

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
