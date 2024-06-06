import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";

const BoostyUser = z.object({
  id: z.number().int().positive(),
  blogUrl: z.string(),
  name: z.string(),
});
type BoostyUser = z.infer<typeof BoostyUser>;

const BoostyPost = z.object({
  id: z.string().uuid(),
  user: BoostyUser,
  publishTime: z.number().int().positive(),
  title: z.string().trim(),
  data: z.any().array(),
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
  const media =
    mediaId !== undefined
      ? post.data.filter(({ type, id }) => type === "image" && id === mediaId)
      : post.data.filter(({ type }) => type === "image");

  let description: string = post.data
    .filter(({ type }) => type === "text" || type === "link")
    .map(({ modificator, content }) =>
      modificator === "BLOCK_END" ? "\n" : JSON.parse(content)[0],
    )
    .join("")
    .trim();

  if (post.tags.length) {
    if (description) {
      description += "\n\n";
    }

    description += post.tags.map((tag) => `#${tag.title}`).join(" ");
  }

  return {
    source: "Boosty",
    url: `https://boosty.to/${post.user.blogUrl}/posts/${post.id}`,
    images: await Promise.all(
      media.map(({ url, width, height }) =>
        probeAndValidateImageUrl(url, undefined, width, height),
      ),
    ),
    artist: post.user.blogUrl,
    date: formatDate(new Date(post.publishTime * 1_000)),
    title: post.title,
    description,
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
