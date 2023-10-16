import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import fastProbe from "../utils/probe-image-size.js";

interface ItakuImageData {
  id: number;
  owner_username: string;
  title: string;
  description: string;
  image: string;
  date_added: string;
}

export function canHandle(url: URL): boolean {
  return url.hostname === "itaku.ee" && url.pathname.startsWith("/images/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const imageId = Number(url.pathname.substring("/images/".length));
  const image = await fetchImage(imageId);

  const imageUrl = image.image;
  const { width, height } = await fastProbe(imageUrl);

  return {
    source: "Itaku",
    url: `https://itaku.ee/images/${image.id}`,
    images: [
      {
        url: imageUrl,
        width,
        height,
      },
    ],
    artist: image.owner_username,
    date: formatDate(new Date(image.date_added)),
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

  return json as ItakuImageData;
}
