import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";

const BskyBlob = z.object({
  $type: z.literal("blob"),
  ref: z.object({
    $link: z.string(),
  }),
  mimeType: z.string(),
});
type BskyBlob = z.infer<typeof BskyBlob>;

const BskyEmbedImages = z.object({
  $type: z.literal("app.bsky.embed.images"),
  images: z
    .object({
      aspectRatio: z
        .object({
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        })
        .optional(),
      image: BskyBlob,
    })
    .array(),
});
type BskyEmbedImages = z.infer<typeof BskyEmbedImages>;

const BskyEmbedRecordWithMedia = z.object({
  $type: z.literal("app.bsky.embed.recordWithMedia"),
  media: BskyEmbedImages,
});
type BskyEmbedRecordWithMedia = z.infer<typeof BskyEmbedRecordWithMedia>;

const BskyPost = z.object({
  $type: z.literal("app.bsky.feed.post"),
  createdAt: z.coerce.date(),
  embed: z.discriminatedUnion("$type", [
    BskyEmbedImages,
    BskyEmbedRecordWithMedia,
  ]),
  text: z.string(),
});
type BskyPost = z.infer<typeof BskyPost>;

const BskyThreadViewPost = z.object({
  $type: z.literal("app.bsky.feed.defs#threadViewPost"),
  post: z.object({
    uri: z.string(),
    cid: z.string(),
    author: z.object({
      did: z.string(),
      handle: z.string(),
    }),
    record: BskyPost,
  }),
});
type BskyThreadViewPost = z.infer<typeof BskyThreadViewPost>;

const BskyNotFoundPost = z.object({
  $type: z.literal("app.bsky.feed.defs#notFoundPost"),
  uri: z.string(),
  notFound: z.boolean(),
});
type BskyNotFoundPost = z.infer<typeof BskyNotFoundPost>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "bsky.app" &&
    /^\/profile\/.+?\/post\/\w+$/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [_0, _1, handle, _3, rkey] = url.pathname.split("/");
  const { did } = await resolveHandle(handle);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const { thread } = await fetchPostThread(uri);

  if (thread.$type === "app.bsky.feed.defs#notFoundPost") {
    throw new Error("Post not found");
  }

  const images =
    thread.post.record.embed.$type === "app.bsky.embed.recordWithMedia"
      ? thread.post.record.embed.media.images
      : thread.post.record.embed.images;

  return {
    source: "Bluesky",
    url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    images: await Promise.all(
      images.map((image) =>
        probeAndValidateImageUrl(
          `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${image.image.ref.$link}`,
          image.image.mimeType,
          image.aspectRatio?.width,
          image.aspectRatio?.height,
        ),
      ),
    ),
    artist: thread.post.author.handle.split(".")[0],
    date: thread.post.record.createdAt,
    title: null,
    description: thread.post.record.text,
  };
}

function resolveHandle(handle: string) {
  return fetchAPI(
    "com.atproto.identity.resolveHandle",
    { handle },
    z.object({ did: z.string() }),
  );
}

function fetchPostThread(uri: string) {
  return fetchAPI(
    "app.bsky.feed.getPostThread",
    { uri },
    z.object({
      thread: z.discriminatedUnion("$type", [
        BskyThreadViewPost,
        BskyNotFoundPost,
      ]),
    }),
  );
}

async function fetchAPI<T extends z.ZodTypeAny>(
  method: string,
  params: Record<string, string>,
  body: T,
): Promise<z.infer<T>> {
  const response = await undici.request(
    `https://public.api.bsky.app/xrpc/${method}?${new URLSearchParams(params).toString()}`,
    {
      headers: {
        accept: "application/json",
      },
      throwOnError: true,
    },
  );
  const json = await response.body.json();

  return body.parse(json);
}
