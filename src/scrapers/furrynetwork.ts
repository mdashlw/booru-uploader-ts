import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

const Artwork = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  made_public_date: z
    .string()
    .transform((d) => d.replace(" ", "T") + "Z")
    .pipe(z.coerce.date()),
  character: z.object({
    name: z.string(),
  }),
  tags: z
    .object({
      value: z.string(),
    })
    .array(),
  images: z.object({
    original: z.string().url(),
  }),
});
type Artwork = z.infer<typeof Artwork>;

const pool = new undici.Pool("https://furrynetwork.com");

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "furrynetwork.com" ||
      url.hostname === "beta.furrynetwork.com") &&
    (url.pathname.startsWith("/artwork/") ||
      (url.searchParams.get("viewType") === "artwork" &&
        url.searchParams.has("viewId")))
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  let artworkId: string;

  if (url.pathname.startsWith("/artwork/")) {
    artworkId = url.pathname.split("/")[2];
  } else if (
    url.searchParams.get("viewType") === "artwork" &&
    url.searchParams.has("viewId")
  ) {
    artworkId = url.searchParams.get("viewId")!;
  } else {
    throw new Error("invalid url");
  }

  const artwork = await fetchArtwork(artworkId);

  let description = artwork.description;

  if (artwork.tags.length) {
    if (description) {
      description += "\n\n";
    }

    description += artwork.tags.map((tag) => `#${tag.value}`).join(" ");
  }

  return {
    source: "Furry Network",
    url: `https://furrynetwork.com/artwork/${artworkId}/${slugifyTitle(artwork.title)}/`,
    images: [await probeImageUrl(artwork.images.original)],
    artist: artwork.character.name,
    date: artwork.made_public_date,
    title: artwork.title.trim(),
    description,
  };
}

function slugifyTitle(title: string) {
  return (title || "untitled")
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
}

function fetchArtwork(artworkId: string) {
  return fetchAPI(`/artwork/${artworkId}`, Artwork);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await pool.request({
    method: "GET",
    path: `/api${path}`,
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
