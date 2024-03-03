import { SourceData } from "../scraper/types.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "cdn.ych.art" && url.pathname.startsWith("/portfolios/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [, , username] = url.pathname.split("/");

  url.searchParams.delete("height");
  url.searchParams.delete("sharpen");

  return {
    source: "YCH.art",
    url: `https://ych.art/user/${username}/portfolio`,
    images: [await probeImageUrl(url)],
    artist: username,
    date: null,
    title: null,
    description: null,
  };
}
