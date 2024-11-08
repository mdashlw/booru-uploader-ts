import type { SourceData } from "../scraper/types.ts";

export function canHandle(url: URL): boolean {
  return true;
}

export async function scrape(url: URL): Promise<SourceData> {
  return {
    source: null,
    url: url.href,
    images: [],
    artist: null,
    date: null,
    title: null,
    description: null,
  };
}
