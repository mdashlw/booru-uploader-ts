import { SourceData } from "../scraper/types.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "cdn.ych.art" && url.pathname.startsWith("/portfolios/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [, , username] = url.pathname.split("/");

  manipulateImageUrl(url);

  return {
    source: "YCH.art",
    url: url.toString(),
    images: [await probeImageUrl(url)],
    artist: username,
    date: null,
    title: null,
    description: null,
  };
}

export function manipulateImageUrl(url: URL) {
  // https://docs.bunny.net/docs/stream-image-processing
  url.search = "";
  url.searchParams.append("width", "0");
  url.searchParams.append("height", "0");
}
