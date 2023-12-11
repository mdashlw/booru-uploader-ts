import process from "node:process";
import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import probeImageSize from "../utils/probe-image-size.js";

const API_VERSION = "5.199";
const API_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN;

const VkPhoto = z.object({
  id: z.number().int(),
  album_id: z.number().int(),
  owner_id: z.number().int(),
  access_key: z.string(),
});
type VkPhoto = z.infer<typeof VkPhoto>;

const VkPhotoExtended = VkPhoto.extend({
  access_key: z.string().optional(),
  orig_photo: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    url: z.string().url(),
  }),
});
type VkPhotoExtended = z.infer<typeof VkPhotoExtended>;

const VkDoc = z.object({
  id: z.number().int(),
  owner_id: z.number().int(),
  type: z.number().int().positive(),
  url: z.string().url(),
});
type VkDoc = z.infer<typeof VkDoc>;

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

const VkDocAttachment = z.object({
  type: z.literal("doc"),
  doc: VkDoc,
});
type VkDocAttachment = z.infer<typeof VkDocAttachment>;

const VkAttachment = z.discriminatedUnion("type", [
  VkPhotoAttachment,
  VkVideoAttachment,
  VkDocAttachment,
]);
type VkAttachment = z.infer<typeof VkAttachment>;

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
  attachments: VkAttachment.array().optional(),
});
type VkPost = z.infer<typeof VkPost>;

const VkComment = z.object({
  id: z.number().int(),
  date: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  text: z.string(),
  attachments: VkAttachment.array().optional(),
});
type VkComment = z.infer<typeof VkComment>;

const VkGroup = z.object({
  id: z.number().int(),
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
  const wallId = url.pathname.substring("/wall".length);
  const post = await fetchPostWithOwner(wallId);
  let comment: VkComment | undefined;
  let attachments: VkAttachment[] | undefined;

  if (
    url.searchParams.has("reply") ||
    url.searchParams.get("w")?.includes("_r")
  ) {
    const commentId = Number(
      url.searchParams.get("reply") ??
        url.searchParams
          .get("w")!
          .substring(url.searchParams.get("w")!.indexOf("_r") + "_r".length),
    );
    comment = await fetchComment(post.owner_id, post.id, commentId);
    attachments = comment.attachments;
  } else {
    attachments = post.attachments;
  }

  let extendedPhotos: VkPhotoExtended[] | undefined;
  if (attachments?.some((attachment) => attachment.type === "photo")) {
    extendedPhotos = await fetchAPI(
      "photos.getById",
      {
        photos: attachments
          .filter(
            (attachment): attachment is VkPhotoAttachment =>
              attachment.type === "photo",
          )
          .map(
            ({ photo }) => `${photo.owner_id}_${photo.id}_${photo.access_key}`,
          )
          .join(","),
        extended: "1",
      },
      VkPhotoExtended.array(),
    );
  }

  let description = post.text;
  if (comment) {
    if (description) {
      description += "\n\n";
    }
    description += comment.text;
  }

  return {
    source: "VK",
    url: `https://vk.com/wall${post.owner_id}_${post.id}${
      comment ? `?reply=${comment.id}` : ""
    }`,
    images: await Promise.all(
      attachments?.map(async (attachment) => {
        if (attachment.type === "photo") {
          const photo = extendedPhotos?.find(
            ({ id }) => id === attachment.photo.id,
          );

          if (!photo) {
            throw new Error("Extended photo not found");
          }

          return {
            url: photo.orig_photo.url,
            type: "jpg",
            width: photo.orig_photo.width,
            height: photo.orig_photo.height,
          };
        }

        if (attachment.type === "doc") {
          if (attachment.doc.type !== 4) {
            throw new Error(`Unsupported doc type: ${attachment.doc.type}`);
          }

          const { type, width, height } = await probeImageSize(
            attachment.doc.url,
          );

          return {
            url: attachment.doc.url,
            type,
            width,
            height,
          };
        }

        throw new Error("Unsupported attachment type");
      }) ?? [],
    ),
    artist: post.owner.screen_name,
    date: formatDate((comment ?? post).date),
    title: null,
    description,
  };
}

async function fetchPostWithOwner(
  wallId: string,
): Promise<VkPost & { owner: VkGroup }> {
  const data = await fetchAPI(
    "wall.getById",
    {
      posts: wallId,
      extended: "1",
    },
    z.object({
      items: VkPost.array(),
      groups: VkGroup.array(),
    }),
  );
  const [post] = data.items;

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

  return {
    ...post,
    owner,
  };
}

async function fetchComment(
  ownerId: number,
  postId: number,
  commentId: number,
): Promise<VkComment> {
  const data = await fetchAPI(
    "wall.getComments",
    {
      owner_id: ownerId.toString(),
      post_id: postId.toString(),
      start_comment_id: commentId.toString(),
      count: "1",
    },
    z.object({
      items: VkComment.array(),
    }),
  );
  const [comment] = data.items;

  if (!comment) {
    throw new Error("Comment not found");
  }

  return comment;
}

async function fetchAPI<T extends z.ZodTypeAny>(
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
