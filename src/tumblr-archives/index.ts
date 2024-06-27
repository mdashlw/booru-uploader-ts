import _ from "lodash";
import { NpfContentBlock, NpfMediaObject } from "../utils/tumblr-npf-types.js";
import { fetchBlogPosts } from "./api.js";
import { client } from "./internal.js";

export type ArchivedTumblrPost = {
  rootPostId: string;
  rootBlogUuid: string;
  rootBlogName: string;
  reblogPostId: string;
  reblogBlogUuid: string;
  reblogBlogName: string;
};

function extractMediaKey(mediaObject: NpfMediaObject) {
  if (mediaObject.mediaKey) {
    return mediaObject.mediaKey;
  }

  return new URL(mediaObject.url).pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.includes(".")) {
        segment = segment.substring(0, segment.indexOf("."));
      }

      if (
        /^tumblr_[a-z]+_/i.test(segment) &&
        !segment.startsWith("tumblr_inline_")
      ) {
        console.log("segment starts with tumblr", segment);
      }

      if (segment.startsWith("tumblr_inline_")) {
        segment = segment.substring("tumblr_inline_".length);
      } else if (segment.startsWith("tumblr_messaging_")) {
        segment = segment.substring("tumblr_messaging_".length);
      } else if (segment.startsWith("tumblr_reply_")) {
        segment = segment.substring("tumblr_reply_".length);
      } else if (segment.startsWith("tumblr_")) {
        segment = segment.substring("tumblr_".length);
      }

      if (segment.includes("_")) {
        segment = segment.substring(0, segment.lastIndexOf("_"));
      }

      return segment;
    })
    .join(":");
}

function transformMediaObject(mediaObject: NpfMediaObject) {
  const key = extractMediaKey(mediaObject);
  const parts = key.split(":");

  if (parts.length > 2) {
    const key_b = parts.pop()!;
    const key_a = parts.join(":");

    return [key, key_a, key_b, null, mediaObject.url];
  }

  let key_a: string | null = parts[0];
  let key_b: string | undefined = parts[1];

  if (!key_b) {
    key_b = key_a;
    key_a = null;
  }

  let key_c: string | null = null;

  if (!key_b.includes("-")) {
    if (key_b.includes("_")) {
      key_c = key_b.substring(0, key_b.lastIndexOf("_"));
    } else {
      key_c = key_b;
    }

    key_c = key_c.substring(10, 17);

    if (key_c.length !== 7 || !key_c.startsWith("1")) {
      console.error("invalid key c (will be null):", {
        key: key,
        url: mediaObject.url,
        key_a,
        key_b,
        key_c,
      });
      key_c = null;
    } else {
      key_c = key_c.substring(1);
    }
  }

  return [key, key_a, key_b, key_c, mediaObject.url];
}

function handleContent(content: NpfContentBlock[]) {
  const mediaObjects = [
    ...content
      .filter((block) => block.type === "image")
      .map((block) => block.media[0]),
    ...content
      .filter((block) => block.type === "video")
      .map((block) => block.media)
      .filter((object) => object !== undefined),
  ];

  return mediaObjects.map(transformMediaObject);
}

export async function archivePosts(blogName: string): Promise<void> {
  let totalPostsSoFar = 0;

  for await (const { totalPosts, posts } of fetchBlogPosts(blogName)) {
    totalPostsSoFar += posts.length;
    console.log(
      `[archivePosts blogName=${blogName}] progress: ${totalPostsSoFar} / ${totalPosts}`,
    );

    await client.query("BEGIN");

    for (const post of posts) {
      await client.query({
        name: "insert-reblogs",
        text: "INSERT INTO reblogs VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        values: [
          post.rebloggedRootId!,
          post.rebloggedRootUuid!,
          post.rebloggedRootName!,
          post.id,
          post.blog.uuid,
          post.blogName,
        ],
      });

      for (const values of [
        ...handleContent(post.content).map((args) =>
          args.concat(post.id, post.blog.uuid),
        ),
        ...(post.rebloggedRootId &&
        post.trail[0]?.post.id === post.rebloggedRootId
          ? handleContent(post.trail[0].content).map((args) =>
              args.concat(post.rebloggedRootId!, post.rebloggedRootUuid!),
            )
          : []),
      ]) {
        await client.query({
          name: "insert-media",
          text: "INSERT INTO media VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
          values,
        });
      }
    }

    await client.query("COMMIT");
  }
}

export async function getReblogs(
  postId: string,
): Promise<ArchivedTumblrPost[]> {
  const { rows } = await client.query<ArchivedTumblrPost>({
    text: "SELECT * FROM reblogs WHERE rootPostId = $1",
    values: [postId],
  });

  return rows;
}

export async function getAllReblogs(
  blogName: string,
): Promise<ArchivedTumblrPost[][]> {
  const { rows } = await client.query<ArchivedTumblrPost>({
    text: "SELECT * FROM reblogs WHERE rootBlogName = $1 OR rootBlogUuid = $1 ORDER BY rootPostId DESC",
    values: [blogName],
  });

  return Object.values(_.groupBy(rows, "rootPostId"));
}
