import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.ts";

const BoostyUser = z.object({
  id: z.number().int().positive(),
  blogUrl: z.string(),
  name: z.string(),
});
type BoostyUser = z.infer<typeof BoostyUser>;

const BoostyTextBlock = z.object({
  type: z.literal("text"),
  modificator: z.string(),
  content: z.string(),
});
type BoostyTextBlock = z.infer<typeof BoostyTextBlock>;

const BoostyLinkBlock = z.object({
  type: z.literal("link"),
  content: z.string(),
});
type BoostyLinkBlock = z.infer<typeof BoostyLinkBlock>;

const BoostyImageBlock = z.object({
  type: z.literal("image"),
  id: z.string().uuid(),
  rendition: z.string(),
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
type BoostyImageBlock = z.infer<typeof BoostyImageBlock>;

const BoostyOkVideoBlock = z.object({
  type: z.literal("ok_video"),
});
type BoostyOkVideoBlock = z.infer<typeof BoostyOkVideoBlock>;

const BoostyPostBlock = z.discriminatedUnion("type", [
  BoostyTextBlock,
  BoostyLinkBlock,
  BoostyImageBlock,
  BoostyOkVideoBlock,
]);
type BoostyPostBlock = z.infer<typeof BoostyPostBlock>;

const BoostyPost = z.object({
  id: z.string().uuid(),
  user: BoostyUser,
  publishTime: z.number().int().positive(),
  title: z.string().trim(),
  data: BoostyPostBlock.array(),
  teaser: BoostyPostBlock.array(),
  tags: z
    .object({
      id: z.number().int().positive(),
      title: z.string(),
    })
    .array(),
});
type BoostyPost = z.infer<typeof BoostyPost>;

export function canHandle(url: URL): boolean {
  return url.hostname === "boosty.to" && url.pathname.includes("/posts/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const [_, blogUrl, _literalPosts, postId, _literalMedia, mediaId] =
    url.pathname.split("/");

  if (
    _literalPosts !== "posts" ||
    (_literalMedia !== undefined && _literalMedia !== "media")
  ) {
    const error: any = new Error("invalid url");
    error.url = url;
    throw error;
  }

  const post = await fetchPost(blogUrl, postId);
  let media = post.data
    .filter((block) => block.type === "image")
    .map((block) => ({
      ...block,
      teaser: false,
    }));

  if (!media.length) {
    media = post.teaser
      .filter((block) => block.type === "image")
      .filter((block) => !block.rendition)
      .map((block) => ({
        ...block,
        teaser: true,
      }));
  }

  const description = post.data
    .filter((block) => block.type === "text" || block.type === "link")
    .map((block) =>
      block.type === "text" && block.modificator === "BLOCK_END"
        ? "\n"
        : JSON.parse(block.content)[0],
    )
    .join("")
    .trim();

  return {
    source: "Boosty",
    url: `https://boosty.to/${post.user.blogUrl}/posts/${post.id}`,
    images: await Promise.all(
      media.map(async ({ id, url, width, height, teaser }) => ({
        selected: id === mediaId,
        pageUrl: teaser
          ? undefined
          : `https://boosty.to/${post.user.blogUrl}/posts/${post.id}/media/${id}`,
        ...(await probeAndValidateImageUrl(url, undefined, width, height)),
      })),
    ),
    artist: post.user.blogUrl,
    date: formatDate(new Date(post.publishTime * 1_000)),
    title: post.title,
    description,
    tags: post.tags.map((tag) => ({
      name: tag.title,
      url: `https://boosty.to/${post.user.blogUrl}?postsTagsIds=${tag.id}`,
    })),
  };
}

async function fetchPost(blogUrl: string, postId: string): Promise<BoostyPost> {
  const response = await undici
    .request(`https://api.boosty.to/v1/blog/${blogUrl}/post/${postId}`)
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.blogUrl = blogUrl;
      error.postId = postId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.blogUrl = blogUrl;
    error.postId = postId;
    error.response = response;
    throw error;
  });

  return BoostyPost.parse(json);
}
