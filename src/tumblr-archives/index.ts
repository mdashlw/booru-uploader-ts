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

export async function archivePosts(blogName: string): Promise<void> {
  for await (const posts of fetchBlogPosts(blogName)) {
    await client.batch(
      posts
        .filter((post) => post.rebloggedRootId)
        .map((post) => ({
          sql: "INSERT OR IGNORE INTO reblogs VALUES (?, ?, ?, ?, ?, ?)",
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
): Promise<ArchivedTumblrPost[]> {
  const { rows } = await client.execute({
    sql: "SELECT * FROM reblogs WHERE rootBlogName = ? GROUP BY rootPostId ORDER BY rootPostId DESC",
    args: [blogName],
  });

  return rows as unknown as ArchivedTumblrPost[];
}
