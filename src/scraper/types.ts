export interface Scraper {
  canHandle: (url: URL) => boolean;
  scrape: (url: URL) => Promise<SourceData>;
}

export interface SourceData {
  source: string;
  url: string;
  images: SourceImageData[];
  artist: string | null;
  date: string;
  title: string | null;
  description: string | null;
}

export interface SourceImageData {
  url: string | (() => Promise<string>);
  width: number;
  height: number;
}
