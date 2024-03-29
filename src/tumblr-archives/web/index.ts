import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { fetchBlogPost } from "../api.js";
import { ArchivedTumblrPost, getAllReblogs } from "../index.js";

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
  const blog = request.query.blog;
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
              reblog.reblogBlogUuid,
              reblog.reblogPostId,
            );
          } catch (error) {
            console.error(
              `Failed to fetch reblog post ${reblog.reblogPostId} (blog ${reblog.reblogBlogUuid} - ${reblog.reblogBlogName})`,
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

try {
  await fastify.listen({ port: 80 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
