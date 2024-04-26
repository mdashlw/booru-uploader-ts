import process from "node:process";
import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

const API_VERSION = "5.199";
const API_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN;

const VkPhoto = z.object({
  id: z.number().int(),
  album_id: z.number().int(),
  owner_id: z.number().int(),
  text: z.string(),
  date: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
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

const VkAudioAttachment = z.object({
  type: z.literal("audio"),
  audio: z.any(),
});
type VkAudioAttachment = z.infer<typeof VkAudioAttachment>;

const VkAttachment = z.discriminatedUnion("type", [
  VkPhotoAttachment,
  VkVideoAttachment,
  VkDocAttachment,
  VkAudioAttachment,
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
    (url.pathname.startsWith("/wall") ||
      url.searchParams.get("w")?.startsWith("wall") ||
      url.pathname.startsWith("/photo") ||
      url.searchParams.get("z")?.startsWith("photo"))
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  if (url.pathname.startsWith("/wall") || url.searchParams.has("w")) {
    const wallId =
      url.searchParams.get("w")?.substring("wall".length) ??
      url.pathname.substring("/wall".length);
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
            .filter((attachment) => attachment.type === "photo")
            .map(
              ({ photo }) =>
                `${photo.owner_id}_${photo.id}_${photo.access_key}`,
            )
            .join(","),
          extended: "1",
        },
        VkPhotoExtended.array(),
      );
    }

    let description = post.text;
    if (comment?.text) {
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
        attachments
          ?.map((attachment) => {
            if (attachment.type === "photo") {
              const photo = extendedPhotos?.find(
                ({ id }) => id === attachment.photo.id,
              );

              if (!photo) {
                throw new Error("Extended photo not found");
              }

              return probeAndValidateImageUrl(
                photo.orig_photo.url,
                undefined,
                photo.orig_photo.width,
                photo.orig_photo.height,
              );
            }

            if (attachment.type === "doc") {
              if (attachment.doc.type !== 4) {
                return null;
              }

              return probeImageUrl(attachment.doc.url);
            }

            return null;
          })
          .filter((promise) => promise !== null) ?? [],
      ),
      artist: getGroupCustomScreenName(post.owner),
      date: formatDate((comment ?? post).date),
      title: null,
      description,
    };
  }

  if (url.pathname.startsWith("/photo") || url.searchParams.has("z")) {
    let photoId =
      url.searchParams.get("z")?.substring("photo".length) ??
      url.pathname.substring("/photo".length);

    if (photoId.includes("/")) {
      photoId = photoId.substring(0, photoId.indexOf("/"));
    }

    const photo = await fetchExtendedPhotoWithOwner(photoId);

    return {
      source: "VK",
      url: `https://vk.com/photo${photo.owner_id}_${photo.id}`,
      images: [
        await probeAndValidateImageUrl(
          photo.orig_photo.url,
          undefined,
          photo.orig_photo.width,
          photo.orig_photo.height,
        ),
      ],
      artist: getGroupCustomScreenName(photo.owner),
      date: formatDate(photo.date),
      title: null,
      description: photo.text,
    };
  }

  throw new Error("Unsupported path");
}

function getGroupCustomScreenName(group: VkGroup): string | null {
  if (group.screen_name === `club${group.id}`) {
    return null;
  }

  return group.screen_name;
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

async function fetchExtendedPhotoWithOwner(
  photoId: string,
): Promise<VkPhotoExtended & { owner: VkGroup }> {
  const data = await fetchAPI(
    "photos.getById",
    {
      photos: photoId,
      extended: "1",
    },
    VkPhotoExtended.array(),
  );
  const [photo] = data;

  if (!photo) {
    throw new Error("Photo not found");
  }

  if (photo.owner_id > 0) {
    throw new Error("Photos not from groups are not supported");
  }

  const ownerId = Math.abs(photo.owner_id);
  const {
    groups: [owner],
  } = await fetchAPI(
    "groups.getById",
    {
      group_id: ownerId.toString(),
    },
    z.object({
      groups: VkGroup.array().nonempty(),
    }),
  );

  return {
    ...photo,
    owner,
  };
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
