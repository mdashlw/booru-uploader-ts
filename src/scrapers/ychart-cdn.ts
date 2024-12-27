import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "cdn.ych.art" && url.pathname.startsWith("/portfolios/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [, , username] = url.pathname.split("/");

  manipulateImageUrl(url);

  return {
    source: null,
    url: `https://ych.art/user/${username}/portfolio`,
    images: [
      {
        ...(await probeImageUrl(url)),
        pageUrl: decodeURIComponent(url.href),
      },
    ],
    artist: username,
    date: null,
    title: null,
    description: null,
    imagePageUrlsAreStandalone: true,
  };
}

export function manipulateImageUrl(url: URL) {
  // https://docs.bunny.net/docs/stream-image-processing

  if (url.pathname.endsWith(".mp4")) {
    url.pathname = url.pathname.replace(".mp4", ".gif");
  }

  if (url.pathname.endsWith(".gif")) {
    return;
  }

  url.search = "";
  url.searchParams.append("width", "0");
  url.searchParams.append("height", "0");
  url.searchParams.append("format", "png");
}
