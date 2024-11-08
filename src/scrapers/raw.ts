import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

export function canHandle(url: URL): boolean {
  return (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  return {
    source: null,
    url: url.href,
    images: [await probeImageUrl(url)],
    artist: null,
    date: null,
    title: null,
    description: null,
  };
}
