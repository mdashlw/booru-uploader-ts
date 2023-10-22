import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

interface BoostyPost {
  id: string;
  user: BoostyUser;
  publishTime: number;
  title: string;
  data: any[];
}

interface BoostyUser {
  id: number;
  blogUrl: string;
  name: string;
}

export function canHandle(url: URL): boolean {
  return url.hostname === "boosty.to" && url.pathname.includes("/posts/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const match = url.pathname.match(/^\/(.+?)\/posts\/(.+)$/);

  if (!match) {
    const error: any = new Error("Failed to match blog url and post id");
    error.url = url;
    throw error;
  }

  const [, blogUrl, postId] = match;
  const post = await fetchPost(blogUrl, postId);

  return {
    source: "Boosty",
    url: `https://boosty.to/${post.user.blogUrl}/posts/${post.id}`,
    images: post.data
      .filter(({ type }) => type === "image")
      .map(({ url, width, height }) => ({
        url,
        width,
        height,
      })),
    artist: post.user.name,
    date: formatDate(new Date(post.publishTime * 1_000)),
    title: post.title,
    description: post.data
      .filter(
        ({ type, modificator }) =>
          type === "text" && modificator !== "BLOCK_END",
      )
      .map(({ content }) => JSON.parse(content)[0])
      .join("\n"),
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

  return json as BoostyPost;
}
