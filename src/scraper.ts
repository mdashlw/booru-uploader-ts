import { Scraper, SourceData } from "./scraper/types.js";
import { scrapers } from "./scrapers/index.js";

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
