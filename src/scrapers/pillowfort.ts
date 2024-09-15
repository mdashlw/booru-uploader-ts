import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { probeImageUrl } from "../utils/probe-image.js";

const pool = new undici.Pool("https://www.pillowfort.social");

const Post = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  publish_at: z.string().pipe(z.coerce.date()),
  tags: z.string().array(),
  username: z.string(),
  media: z
    .object({
      id: z.number(),
      url: z.string().url(),
    })
    .array(),
});
type Post = z.infer<typeof Post>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "www.pillowfort.social" &&
    url.pathname.startsWith("/posts/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  let postId: number;

  if (url.pathname.startsWith("/posts/")) {
    postId = Number(url.pathname.split("/")[2]);

    if (Number.isNaN(postId)) {
      throw new Error("invalid post id");
    }
  } else {
    throw new Error("invalid url");
  }

  const post = await fetchPost(postId);

  return {
    source: "Pillowfort",
    url: `https://www.pillowfort.social/posts/${post.id}`,
    images: await Promise.all(post.media.map(({ url }) => probeImageUrl(url))),
    artist: post.username,
    date: formatDate(post.publish_at),
    title: post.title,
    description: (booru) => {
      let description = convertHtmlToMarkdown(post.content, booru.markdown);

      if (post.tags.length) {
        if (description) {
          description += "\n\n";
        }

        description += post.tags.map((tag) => `#${tag}`).join(" ");
      }

      return description;
    },
  };
}

function fetchPost(postId: number) {
  return fetchAPI(`/posts/${postId}/json`, Post);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await pool.request({
    method: "GET",
    path,
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
