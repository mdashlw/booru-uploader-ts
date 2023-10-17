import { SourceData } from "../scraper/types.js";
import fastProbe from "../utils/probe-image-size.js";

export function canHandle(url: URL): boolean {
  return (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const { width, height } = await fastProbe(url);

  return {
    source: "Direct",
    url: url.toString(),
    images: [
      {
        url: url.toString(),
        width,
        height,
      },
    ],
    artist: null,
    date: null,
    title: null,
    description: null,
  };
}
