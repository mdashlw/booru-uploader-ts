import Booru from "../booru/index.js";

export interface Scraper {
  canHandle: (url: URL) => boolean;
  scrape: (url: URL, metadataOnly?: boolean) => Promise<SourceData>;
}

export interface SourceData {
  source: string;
  url: string;
  images: SourceImageData[];
  artist: string | null;
  date: string | null;
  title: string | null;
  description: string | null | ((booru: Booru) => string);
}

export interface SourceImageData {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}
