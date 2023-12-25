import { boorus } from "../boorus.js";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeImageUrlAndValidate } from "../scraper/utils.js";

export function canHandle(url: URL): boolean {
  return (
    boorus.some((b) => b.baseUrl.hostname === url.hostname) &&
    /^\/(?:images\/)?(\d+)$/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const booru = boorus.find((b) => b.baseUrl.hostname === url.hostname);

  if (!booru) {
    throw new Error(`Unsupported booru: ${url.hostname}`);
  }

  const imageIdMatch = /^\/(?:images\/)?(\d+)$/.exec(url.pathname);

  if (!imageIdMatch) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const imageId = Number(imageIdMatch[1]);
  const image = await booru.fetchImage(imageId).catch((error) => {
    throw new Error(`Failed to fetch image ${imageId} on ${booru.name}`, {
      cause: error,
    });
  });

  if (!image) {
    throw new Error(`Image not found: ${imageId}`);
  }

  return {
    source: booru.name,
    url: new URL(`/images/${imageId}`, booru.baseUrl).toString(),
    images: [
      await probeImageUrlAndValidate(
        image.representations.full,
        image.format,
        image.width,
        image.height,
      ),
    ],
    artist:
      image.tags
        .find((t) => t.startsWith("artist:"))
        ?.substring("artist:".length) ?? null,
    date: formatDate(new Date(image.first_seen_at)),
    title: null,
    description: image.description,
  };
}
