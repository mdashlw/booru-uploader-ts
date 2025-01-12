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

export const ArchivedTumblrMedia = z.object({
  key: z.string(),
  key_a: z.string().nullable(),
  key_b: z.string(),
  key_c: z.string().nullable(),
  url: z.string(),
  post_id: z.string(),
  blog_uuid: z.string(),
});
export type ArchivedTumblrMedia = z.infer<typeof ArchivedTumblrMedia>;

export async function getReblogs(postId: string) {
  const response = await undici.request(`${BASE_URL}/reblogs/${postId}`, {
    throwOnError: true,
  });
  const json = await response.body.json();

  return ArchivedTumblrPost.array().parse(json);
}

export async function getMediaByKey(key: string) {
  const response = await undici.request(`${BASE_URL}/media/key/${key}`, {
    throwOnError: true,
  });
  const json = await response.body.json();

  return ArchivedTumblrMedia.array().parse(json);
}

export async function getMediaByKeyA(keyA: string) {
  const response = await undici.request(`${BASE_URL}/media/key_a/${keyA}`, {
    throwOnError: true,
  });
  const json = await response.body.json();

  return ArchivedTumblrMedia.array().parse(json);
}

export async function getMediaByKeyB(keyB: string) {
  const response = await undici.request(`${BASE_URL}/media/key_b/${keyB}`, {
    throwOnError: true,
  });
  const json = await response.body.json();

  return ArchivedTumblrMedia.array().parse(json);
}
