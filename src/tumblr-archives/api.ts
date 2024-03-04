import { keyv } from "./internal.js";
import { TumblrPost, fetchBlogPosts } from "./tumblr.js";

export async function archivePosts(blogName: string): Promise<void> {
  for await (const posts of fetchBlogPosts(blogName)) {
    for (const post of posts) {
      if (!post.rebloggedRootId) {
        continue;
      }

      const reblogs = await keyv.get(post.rebloggedRootId);

      if (!reblogs) {
        await keyv.set(post.rebloggedRootId, { [post.id]: post });
      } else if (!reblogs[post.id]) {
        reblogs[post.id] = post;
        await keyv.set(post.rebloggedRootId, reblogs);
      }
    }
  }
}

export async function getReblogs(postId: string): Promise<TumblrPost[]> {
  const posts = await keyv.get(postId);

  if (!posts) {
    return [];
  }

  return Object.values(posts);
}
