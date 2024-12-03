import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAPI, fetchBlogPost } from "../api.ts";
import { type ArchivedTumblrPost, getAllReblogs } from "../index.ts";
import { z } from "zod";

const reblogsCache = new Map<string, ArchivedTumblrPost[][]>();

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

fastify.register(fastifyStatic, {
  root: dirname(fileURLToPath(import.meta.url)),
});

fastify.get("/blog-viewer", (_request, reply) =>
  reply.sendFile("blog-viewer.html"),
);

fastify.get("/blog-images", async (request, reply) => {
  const blog = request.query.blog.toLowerCase();
  const offset = Number(request.query.offset);

  if (!reblogsCache.has(blog)) {
    reblogsCache.set(blog, await getAllReblogs(blog));
  }

  const listOfReblogs = reblogsCache.get(blog)!.slice(offset, offset + 10);

  if (!listOfReblogs.length) {
    return reply.send({ stop: true });
  }

  const images = (
    await Promise.all(
      listOfReblogs.map(async (reblogs) => {
        for (const reblog of reblogs) {
          let post: any;

          try {
            post = await fetchBlogPost(
              reblog.reblog_blog_uuid,
              reblog.reblog_post_id,
            );
          } catch (error) {
            console.error(
              `Failed to fetch reblog post ${reblog.reblog_post_id} (blog ${reblog.reblog_blog_uuid} - ${reblog.reblog_blog_name})`,
              error,
            );
            continue;
          }

          const trail = post.trail[0];

          if (!trail) {
            console.error("No trail", post);
            return [];
          }

          return trail.content
            .filter((block) => block.type === "image")
            .map((image) => ({
              // href: reblog.postUrl,
              postId: post.rebloggedRootId,
              href: post.rebloggedRootUrl,
              src: image.media[0].url,
            }));
        }

        return [];
      }),
    )
  ).flat();

  return reply.send(images);
});

fastify.get("/posts", async (request) => {
  const requestQuery = request.query as Record<string, string>;
  const proxiedParams = ["fields[blogs]", "npf", "reblog_info", "context"];
  const proxiedParamsString = Object.entries(request.query as object)
    .filter(([key]) => proxiedParams.includes(key))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const blogName = requestQuery.blog;
  const offset = requestQuery.offset ? Number(requestQuery.offset) : 0;

  console.log({ proxiedParamsString, blogName, offset });

  if (!reblogsCache.has(blogName)) {
    reblogsCache.set(blogName, await getAllReblogs(blogName));
  }

  const perPage = 10;
  const allReblogs = reblogsCache.get(blogName)!;
  const listOfReblogs = allReblogs.slice(offset, offset + perPage);

  const posts = (
    await Promise.all(
      listOfReblogs.map(async (reblogs) => {
        let post: any;

        const [anyReblog] = reblogs;
        try {
          const response = await fetchAPI(
            `/api/v2/blog/${anyReblog.root_blog_uuid}/posts/${anyReblog.root_post_id}/permalink?${proxiedParamsString}`,
            z
              .object({
                timeline: z.object({
                  elements: z.any().array().length(1),
                }),
              })
              .passthrough(),
          );

          post = response.timeline.elements[0];
        } catch (error) {
          console.error(
            `Failed to fetch post ${anyReblog.root_post_id} (blog ${anyReblog.root_blog_uuid} - ${anyReblog.root_blog_name})`,
          );
        }

        if (!post) {
          for (const reblog of reblogs) {
            let reblogPost: any;

            try {
              const response = await fetchAPI(
                `/api/v2/blog/${reblog.reblog_blog_uuid}/posts/${reblog.reblog_post_id}/permalink?${proxiedParamsString}`,
                z
                  .object({
                    timeline: z.object({
                      elements: z.any().array().length(1),
                    }),
                  })
                  .passthrough(),
              );
              reblogPost = response.timeline.elements[0];
            } catch (error) {
              console.error(
                `Failed to fetch reblog post ${reblog.reblog_post_id} (blog ${reblog.reblog_blog_uuid} - ${reblog.reblog_blog_name})`,
                error,
              );
              continue;
            }

            const trail = reblogPost.trail.find(
              (t) => t.post.id === reblogPost.rebloggedRootId,
            );

            if (!trail) {
              continue;
            }

            post = reblogPost;
          }
        }

        return post;
      }),
    )
  ).filter(Boolean);

  let blog = posts.find((p) => !p.rebloggedRootId)?.blog;
  if (!blog) {
    for (const post of posts) {
      const trail = post.trail.find((t) => t.post.id === post.rebloggedRootId);
      if (trail) {
        blog = trail.blog;
        break;
      }
    }
  }

  return {
    meta: {
      status: 200,
      msg: "OK",
    },
    response: {
      totalPosts: allReblogs.length,
      blog,
      links: {
        next: {
          method: "GET",
          href: `/v2/blog/${blogName}/posts?${proxiedParamsString}&offset=${offset + perPage}`,
          queryParams: {
            ...Object.fromEntries(
              Object.entries(request.query as object).filter(([key]) =>
                proxiedParams.includes(key),
              ),
            ),
            "fields[blogs]": undefined,
            fields: {
              blogs: requestQuery["fields[blogs]"],
            },
            offset: `${offset + perPage}`,
          },
        },
      },
      posts,
    },
  };
});

try {
  await fastify.listen({ port: 8080 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
