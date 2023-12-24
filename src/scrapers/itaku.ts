import undici from "undici";
import z from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import probeImageSize from "../utils/probe-image.js";

/*
 * Samples:
 * - SFW: https://itaku.ee/images/582647 (709x1080 png)
 * - SFW: https://itaku.ee/images/499189 (2550x3300 png)
 * - SFW: https://itaku.ee/images/669780 (6500x4500 png)
 * - Questionable: https://itaku.ee/images/516330 (1079x900 png)
 * - Questionable: https://itaku.ee/images/647530 (2890x2289 jpg)
 * - NSFW: https://itaku.ee/images/622847 (1109x879 png)
 * - NSFW: https://itaku.ee/images/647416 (1820x2389 png)
 */

const ItakuImageData = z.object({
  id: z.number().int().positive(),
  owner_username: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string().url(),
  date_added: z.coerce.date(),
});
type ItakuImageData = z.infer<typeof ItakuImageData>;

export function canHandle(url: URL): boolean {
  return url.hostname === "itaku.ee" && url.pathname.startsWith("/images/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const imageId = Number(url.pathname.substring("/images/".length));
  const image = await fetchImage(imageId);

  const imageUrl = image.image;
  const { type, width, height } = await probeImageSize(imageUrl);

  return {
    source: "Itaku",
    url: `https://itaku.ee/images/${image.id}`,
    images: [
      {
        url: imageUrl,
        type,
        width,
        height,
      },
    ],
    artist: image.owner_username,
    date: formatDate(image.date_added),
    title: image.title,
    description: image.description,
  };
}

async function fetchImage(imageId: number): Promise<ItakuImageData> {
  const response = await undici
    .request(`https://itaku.ee/api/galleries/images/${imageId}/`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.imageId = imageId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.imageId = imageId;
    error.response = response;
    throw error;
  });

  return ItakuImageData.parse(json);
}
