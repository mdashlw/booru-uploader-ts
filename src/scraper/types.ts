import type Booru from "../booru/index.ts";
import type { Blob } from "node:buffer";

export interface Scraper {
  canHandle: (url: URL) => boolean;
  scrape: (url: URL, metadataOnly?: boolean) => Promise<SourceData>;
}

export interface SourceData {
  source: string | null;
  url: string;
  images: SourceImageData[];
  artist: string | string[] | null;
  date: Date | null;
  title: string | null;
  description: string | null | ((booru: Booru) => string);
  tags?: {
    name: string;
    url: string;
  }[];
  imagePageUrlsAreStandalone?: boolean;
}

export interface SourceImageData {
  selected?: boolean;
  pageUrl?: string;
  blob: Blob;
  filename: string | undefined;
  type: string;
  width: number;
  height: number;
  title?: string;
  description?: string | null;
  displayName?: string;
}
