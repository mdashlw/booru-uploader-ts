import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname } from "path";
import undici from "undici";
import { fileURLToPath } from "url";
import { TumblrPost } from "../api.js";
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
        const body = await undici
          .request(`https://www.tumblr.com/${reblog.blogName}/${reblog.id}`, {
            headers: {
              accept: "text/html",
              "accept-language": "en-us",
              "cache-control": "no-cache",
              dnt: "1",
              pragma: "no-cache",
              "sec-ch-ua":
                '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "sec-fetch-dest": "document",
              "sec-fetch-mode": "navigate",
              "sec-fetch-site": "none",
              "sec-fetch-user": "?1",
              "upgrade-insecure-requests": "1",
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
            },
            maxRedirections: 1,
          })
          .then((response) => response.body.text());
        const match = /window\['___INITIAL_STATE___'] = (.+);/.exec(body);

        if (!match) {
          return [];
        }

        const data = eval(`(${match[1]})`);
        const post = data.PeeprRoute.initialTimeline.objects[0];

        return post.trail[0].content
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
