import type { Scraper, SourceData } from "./scraper/types.ts";
import { scrapers } from "./scrapers/index.ts";

export function findScraper(url: URL): Scraper | undefined {
  return scrapers.find((scraper) => scraper.canHandle(url));
}

export default function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  const scraper = findScraper(url);

  if (!scraper) {
    throw new Error(`No scraper found for URL: ${url}`);
  }

  return scraper.scrape(url, metadataOnly);
}
