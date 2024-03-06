import { TumblrPost, fetchBlogPosts } from "./api.js";
import { keyv } from "./internal.js";

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

export async function getAllReblogs(blogName: string): Promise<TumblrPost[]> {
  const posts: TumblrPost[] = [];

  for await (const [, _reblogs] of keyv.iterator()) {
    const [reblog]: TumblrPost[] = Object.values(_reblogs);

    if (reblog.rebloggedRootName === blogName) {
      posts.push(reblog);
    }
  }

  return posts;
}
