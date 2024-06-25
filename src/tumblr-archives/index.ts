import _ from "lodash";
import { NpfContentBlock, NpfMediaObject } from "../utils/tumblr-npf-types.js";
import { fetchBlogPosts } from "./api.js";
import { client, clientReliableBatch } from "./internal.js";

export type ArchivedTumblrPost = {
  rootPostId: string;
  rootBlogUuid: string;
  rootBlogName: string;
  reblogPostId: string;
  reblogBlogUuid: string;
  reblogBlogName: string;
};

export async function archivePosts(blogName: string): Promise<void> {
  let totalPostsSoFar = 0;

  for await (const { totalPosts, posts } of fetchBlogPosts(blogName)) {
    totalPostsSoFar += posts.length;
    console.log(
      `[archivePosts blogName=${blogName}] progress: ${totalPostsSoFar} / ${totalPosts}`,
    );
    await clientReliableBatch(
      posts
        .filter((post) => post.rebloggedRootId)
        .map((post) => ({
          sql: "INSERT INTO reblogs VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (rootPostId, reblogPostId) DO NOTHING",
          args: [
            post.rebloggedRootId!,
            post.rebloggedRootUuid!,
            post.rebloggedRootName!,
            post.id,
            post.blog.uuid,
            post.blogName,
          ],
        })),
      "write",
    );
    await clientReliableBatch(
      posts.flatMap((post) => {
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

        return [
          ...handleContent(post.content).map((args) =>
            args.concat(post.id, post.blog.uuid),
          ),
          ...(post.rebloggedRootId && post.trail.length
            ? handleContent(post.trail[0].content).map((args) =>
                args.concat(post.rebloggedRootId!, post.rebloggedRootUuid!),
              )
            : []),
        ].map((args) => ({
          sql: "INSERT INTO media VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
          args,
        }));
      }),
      "write",
    );
  }
}

export async function getReblogs(
  postId: string,
): Promise<ArchivedTumblrPost[]> {
  const { rows } = await client.execute({
    sql: "SELECT * FROM reblogs WHERE rootPostId = ?",
    args: [postId],
  });

  return rows as unknown as ArchivedTumblrPost[];
}

export async function getAllReblogs(
  blogName: string,
): Promise<ArchivedTumblrPost[][]> {
  const { rows } = await client.execute({
    sql: "SELECT * FROM reblogs WHERE rootBlogName = ?1 OR rootBlogUuid = ?1 ORDER BY rootPostId DESC",
    args: [blogName],
  });
  const posts = rows as unknown as ArchivedTumblrPost[];

  return Object.values(_.groupBy(posts, "rootPostId"));
}
