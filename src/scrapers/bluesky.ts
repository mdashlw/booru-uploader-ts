import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";
import type { MarkdownDialect } from "../booru/types.ts";

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
      alt: z.string(),
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

const BskyEmbedExternal = z.object({
  $type: z.literal("app.bsky.embed.external"),
});
type BskyEmbedExternal = z.infer<typeof BskyEmbedExternal>;

const BskyRichtextFacet = z.discriminatedUnion("$type", [
  z.object({
    $type: z.literal("app.bsky.richtext.facet#tag"),
    tag: z.string(),
  }),
  z.object({
    $type: z.literal("app.bsky.richtext.facet#mention"),
    did: z.string(),
  }),
  z.object({
    $type: z.literal("app.bsky.richtext.facet#link"),
    uri: z.string(),
  }),
]);
type BskyRichtextFacet = z.infer<typeof BskyRichtextFacet>;

const BskyFeedPost = z.object({
  $type: z.literal("app.bsky.feed.post"),
  createdAt: z.coerce.date(),
  embed: z
    .discriminatedUnion("$type", [
      BskyEmbedImages,
      BskyEmbedRecordWithMedia,
      BskyEmbedExternal,
    ])
    .optional(),
  facets: z
    .object({
      index: z.object({
        byteStart: z.number(),
        byteEnd: z.number(),
      }),
      features: BskyRichtextFacet.array(),
    })
    .array()
    .optional(),
  text: z.string(),
});
type BskyFeedPost = z.infer<typeof BskyFeedPost>;

const BskyThreadViewPost = z.object({
  $type: z.literal("app.bsky.feed.defs#threadViewPost"),
  post: z.object({
    uri: z.string(),
    cid: z.string(),
    author: z.object({
      did: z.string(),
      handle: z.string(),
    }),
    record: BskyFeedPost,
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

  let images: BskyEmbedImages["images"];

  if (
    thread.post.record.embed === undefined ||
    thread.post.record.embed.$type === "app.bsky.embed.external"
  ) {
    images = [];
  } else if (
    thread.post.record.embed.$type === "app.bsky.embed.recordWithMedia"
  ) {
    images = thread.post.record.embed.media.images;
  } else {
    images = thread.post.record.embed.images;
  }

  return {
    source: "Bluesky",
    url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    images: await Promise.all(
      images.map(async (image) => ({
        ...(await probeAndValidateImageUrl(
          `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${image.image.ref.$link}`,
          image.image.mimeType,
          image.aspectRatio?.width,
          image.aspectRatio?.height,
        )),
        description: image.alt,
      })),
    ),
    artist: thread.post.author.handle.split(".")[0],
    date: thread.post.record.createdAt,
    title: null,
    description: (booru) => getRichText(thread.post.record, booru.markdown),
  };
}

function getRichText(post: BskyFeedPost, markdown: MarkdownDialect) {
  if (!post.facets) {
    return post.text;
  }

  let text = Buffer.from(post.text);

  for (const { index, features } of [...post.facets].reverse()) {
    let subtext = text.subarray(index.byteStart, index.byteEnd).toString();

    for (const feature of features) {
      if (feature.$type === "app.bsky.richtext.facet#tag") {
        subtext = markdown.inlineLink(
          subtext,
          `https://bsky.app/hashtag/${feature.tag}`,
        );
      } else if (feature.$type === "app.bsky.richtext.facet#mention") {
        subtext = markdown.inlineLink(
          subtext,
          `https://bsky.app/profile/${feature.did}`,
        );
      } else if (feature.$type === "app.bsky.richtext.facet#link") {
        subtext = markdown.inlineLink(subtext, feature.uri);
      }
    }

    text = Buffer.from(
      text.subarray(0, index.byteStart).toString() +
        subtext +
        text.subarray(index.byteEnd).toString(),
    );
  }

  return text.toString();
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
