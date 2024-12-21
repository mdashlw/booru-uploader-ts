import undici from "undici";
import { z } from "zod";

const BASE_URL = "https://tumblr-archives-consumer.mdashlw.workers.dev";

export const ArchivedTumblrPost = z.object({
  root_post_id: z.string(),
  root_blog_uuid: z.string(),
  root_blog_name: z.string(),
  reblog_post_id: z.string(),
  reblog_blog_uuid: z.string(),
  reblog_blog_name: z.string(),
});
export type ArchivedTumblrPost = z.infer<typeof ArchivedTumblrPost>;

export async function getReblogs(
  postId: string,
): Promise<ArchivedTumblrPost[]> {
  const response = await undici.request(`${BASE_URL}/reblogs/${postId}`, {
    throwOnError: true,
  });
  const json = await response.body.json();

  return ArchivedTumblrPost.array().parse(json);
}
