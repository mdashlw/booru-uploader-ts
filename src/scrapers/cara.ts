import type { SourceData } from "../scraper/types.js";
import undici from "undici";
import { z } from "zod";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

const Image = z.object({
  id: z.string().uuid(),
  src: z.string(),
  order: z.number(),
});
type Image = z.infer<typeof Image>;

const Post = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  createdAt: z.string().pipe(z.coerce.date()),
  content: z.string(),
  images: Image.array(),
  title: z.string(),
  tags: z
    .object({
      value: z.string(),
    })
    .array(),
});
type Post = z.infer<typeof Post>;

const BASE_URL = "https://cara.app";
const BASE_CDN_URL = "https://cdn.cara.app";

const pool = new undici.Pool(BASE_URL);

export function canHandle(url: URL): boolean {
  return url.hostname === "cara.app";
}

export async function scrape(url: URL): Promise<SourceData> {
  if (!url.pathname.startsWith("/post/")) {
    throw new Error(`invalid url: ${url.href}`);
  }

  const postId = url.pathname.split("/")[2];
  const post = await fetchPost(postId);

  return {
    source: "Cara",
    url: `${BASE_URL}/post/${post.id}`,
    images: await Promise.all(
      post.images
        .filter((image) => image.order >= 0)
        .map((image) => probeImageUrl(`${BASE_CDN_URL}/${image.src}`)),
    ),
    artist: post.slug,
    date: formatDate(post.createdAt),
    title: post.title.trim(),
    description: post.content,
    tags: post.tags.map(({ value }) => ({
      name: value,
      url: `${BASE_URL}/search?q=%23${encodeURIComponent(value)}`,
    })),
  };
}

function fetchPost(postId: string) {
  return fetchAPI(`/posts/${postId}`, Post);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await pool.request({
    method: "GET",
    path: `/api${path}`,
    headers: {
      "user-agent": "Googlebot",
    },
    throwOnError: true,
  });
  const json = await response.body.json();
  const { data } = z
    .object({
      data: body,
    })
    .parse(json);

  return data;
}
