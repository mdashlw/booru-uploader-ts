import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { TumblrPost, fetchBlogPost } from "../api.js";
import { getAllReblogs } from "../index.js";

const reblogsCache = new Map<string, TumblrPost[]>();

const fastify = Fastify({
  logger: true,
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

  const reblogs = reblogsCache.get(blog)!.slice(offset, offset + 10);

  const images = (
    await Promise.all(
      reblogs.map(async (reblog) => {
        const post = await fetchBlogPost(reblog.blogName, reblog.id);
        const trail = post.trail[0];

        if (!trail) {
          console.log(post);
          return [];
        }

        return trail.content
          .filter((block) => block.type === "image")
          .map((image) => ({
            // href: reblog.postUrl,
            href: reblog.rebloggedRootUrl,
            src: image.media[0].url,
          }));
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
