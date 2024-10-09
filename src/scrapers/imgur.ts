import type { SourceData } from "../scraper/types.ts";
import { z } from "zod";
import undici from "undici";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.ts";

const Post = z.object({
  id: z.string(),
  title: z.string().trim(),
  description: z.string().trim(),
  created_at: z.string().pipe(z.coerce.date()),
  url: z.string().url(),
  media: z
    .object({
      id: z.string(),
      mime_type: z.string().includes("/"),
      type: z.string(),
      name: z.string(),
      url: z.string().url(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      size: z.number().int().positive(),
      metadata: z.object({
        title: z.string().trim(),
        description: z.string().trim(),
      }),
    })
    .array(),
});
type Post = z.infer<typeof Post>;

const HOST = "imgur.com";
const ORIGIN = `https://${HOST}`;
const API_HOST = `api.${HOST}`;
const API_ORIGIN = `https://${API_HOST}`;
const CLIENT_ID = "546c25a59c58ad7";

const pool = new undici.Pool(API_ORIGIN);

export function canHandle(url: URL): boolean {
  return (
    url.hostname === HOST &&
    (url.pathname.startsWith("/a/") || url.pathname.split("/").length === 2)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  if (url.pathname.startsWith("/a/")) {
    const postId = url.pathname.split("/")[2].split("-").at(-1)!;
    const post = await fetchAlbumPost(postId);

    return {
      source: "Imgur",
      url: post.url,
      images: await Promise.all(
        post.media
          .filter((media) => media.type === "image")
          .map(async (media) => ({
            ...(await probeAndValidateImageUrl(
              media.url,
              media.mime_type,
              media.width,
              media.height,
              undefined,
              media.size,
            )),
            pageUrl: `${ORIGIN}/${media.id}`,
            title: media.metadata.title,
            description: media.metadata.description,
          })),
      ),
      artist: null,
      date: formatDate(post.created_at),
      title: post.title,
      description: post.description,
      imagePageUrlsAreStandalone: true,
    };
  } else {
    const postId = url.pathname.substring(1);
    const post = await fetchMediaPost(postId);

    if (post.media.length !== 1) {
      throw new Error("Unexpected media length");
    }

    const [media] = post.media;

    if (media.type !== "image") {
      throw new Error("Unexpected media type");
    }

    return {
      source: "Imgur",
      url: post.url,
      images: [
        await probeAndValidateImageUrl(
          media.url,
          media.mime_type,
          media.width,
          media.height,
          undefined,
          media.size,
        ),
      ],
      artist: null,
      date: formatDate(post.created_at),
      title: post.title,
      description: post.description,
    };
  }
}

function fetchAlbumPost(id: string) {
  return fetchAPI(`/post/v1/albums/${id}`, ["media"], Post);
}

function fetchMediaPost(id: string) {
  return fetchAPI(`/post/v1/media/${id}`, ["media"], Post);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  include: string[],
  body: T,
): Promise<z.infer<T>> {
  const response = await pool.request({
    method: "GET",
    path,
    query: {
      client_id: CLIENT_ID,
      include: include.join(","),
    },
    throwOnError: true,
  });
  const json = await response.body.json();
  const data = body.parse(json);

  return data;
}
