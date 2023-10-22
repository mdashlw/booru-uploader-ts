import { SourceData } from "../scraper/types.js";

export function canHandle(url: URL): boolean {
  return false;
}

export async function scrape(url: URL): Promise<SourceData> {
  return {
    source: url.hostname,
    url: url.toString(),
    images: [],
    artist: null,
    date: null,
    title: null,
    description: null,
  };
}
