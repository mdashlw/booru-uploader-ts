import process from "node:process";
import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

const API_VERSION = "5.199";
const API_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN;

const VkPhoto = z.object({
  id: z.number().int(),
  album_id: z.number().int(),
  owner_id: z.number().int(),
});
type VkPhoto = z.infer<typeof VkPhoto>;

const VkPhotoExtended = VkPhoto.extend({
  orig_photo: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    url: z.string().url(),
  }),
});
type VkPhotoExtended = z.infer<typeof VkPhotoExtended>;

const VkPhotoAttachment = z.object({
  type: z.literal("photo"),
  photo: VkPhoto,
});
type VkPhotoAttachment = z.infer<typeof VkPhotoAttachment>;

const VkVideoAttachment = z.object({
  type: z.literal("video"),
  video: z.any(),
});
type VkVideoAttachment = z.infer<typeof VkVideoAttachment>;

const VkPostAttachment = z.discriminatedUnion("type", [
  VkPhotoAttachment,
  VkVideoAttachment,
]);
type VkPostAttachment = z.infer<typeof VkPostAttachment>;

const VkPost = z.object({
  id: z.number().int(),
  owner_id: z.number().int(),
  date: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  text: z.string(),
  attachments: VkPostAttachment.array(),
});
type VkPost = z.infer<typeof VkPost>;

const VkGroup = z.object({
  id: z.number(),
  name: z.string(),
  screen_name: z.string(),
});
type VkGroup = z.infer<typeof VkGroup>;

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "vk.com" ||
      url.hostname === "www.vk.com" ||
      url.hostname === "m.vk.com" ||
      url.hostname === "vk.ru" ||
      url.hostname === "www.vk.ru" ||
      url.hostname === "m.vk.ru") &&
    url.pathname.startsWith("/wall")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const wallPostId = url.pathname.substring("/wall".length);
  const wallPost = await fetchWallPost(wallPostId);

  return {
    source: "VK",
    url: `https://vk.com${url.pathname}`,
    images: wallPost.photos.map((photo) => ({
      url: photo.orig_photo.url,
      type: "jpg",
      width: photo.orig_photo.width,
      height: photo.orig_photo.height,
    })),
    artist: wallPost.owner.screen_name,
    date: formatDate(wallPost.date),
    title: null,
    description: wallPost.text,
  };
}

async function fetchWallPost(wallPostId: string) {
  const data = await fetchAPI(
    "wall.getById",
    {
      posts: wallPostId,
      extended: "1",
    },
    z.object({
      items: VkPost.array(),
      groups: VkGroup.array(),
    }),
  );
  const post = data.items[0];

  if (!post) {
    throw new Error("Post not found");
  }

  if (post.owner_id > 0) {
    throw new Error("Posts not from groups are not supported");
  }

  const ownerId = Math.abs(post.owner_id);
  const owner = data.groups.find((group) => group.id === ownerId);

  if (!owner) {
    throw new Error("Owner not found");
  }

  const photos = await fetchAPI(
    "photos.getById",
    {
      photos: post.attachments
        .filter(
          (attachment): attachment is VkPhotoAttachment =>
            attachment.type === "photo",
        )
        .map(({ photo }) => `${photo.owner_id}_${photo.id}`)
        .join(","),
      extended: "1",
    },
    VkPhotoExtended.array(),
  );

  return {
    ...post,
    owner,
    photos,
  };
}

async function fetchAPI<T extends z.ZodType<any, any, any>>(
  method: string,
  params: Record<string, string>,
  body: T,
): Promise<z.infer<T>> {
  if (!API_ACCESS_TOKEN) {
    throw new Error("VK access token is not set");
  }

  const response = await undici.request(
    `https://api.vk.com/method/${method}?${new URLSearchParams({
      v: API_VERSION,
      access_token: API_ACCESS_TOKEN,
      ...params,
    }).toString()}`,
    { throwOnError: true },
  );
  const json = await response.body.json();
  const data = z.object({ response: body }).parse(json);

  return data.response;
}
