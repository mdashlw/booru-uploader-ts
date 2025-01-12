import type { SourceData } from "../scraper/types.ts";
import { getMediaByKeyB } from "../tumblr-archives.ts";
import { scrape as scrapeTumblr } from "./tumblr.ts";

export function canHandle(url: URL): boolean {
  return url.hostname === "tumblr-media.fake";
}

export async function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  if (url.pathname.startsWith("/key/")) {
    const mediaKeyB = url.pathname.split("/")[2];

    if (!mediaKeyB) {
      throw new Error("invalid url");
    }

    const [media] = await getMediaByKeyB(mediaKeyB);

    if (!media) {
      throw new Error("media not found");
    }

    return scrapeTumblr(
      new URL(`https://www.tumblr.com/${media.blog_uuid}/${media.post_id}`),
      metadataOnly,
    );
  } else {
    throw new Error("invalid url");
  }
}
