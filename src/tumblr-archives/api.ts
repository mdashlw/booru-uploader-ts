import retry from "async-retry";
import undici from "undici";
import { z } from "zod";

export const TumblrPost = z.object({
  blogName: z.string(),
  id: z.string(),
  postUrl: z.string(),
  rebloggedRootId: z.string().optional(),
  rebloggedRootUrl: z.string().optional(),
  rebloggedRootName: z.string().optional(),
  rebloggedRootUuid: z.string().optional(),
});
export type TumblrPost = z.infer<typeof TumblrPost>;

const pool = new undici.Pool("https://www.tumblr.com");

export async function* fetchBlogPosts(
  blogName: string,
): AsyncGenerator<TumblrPost[], void, void> {
  let nextHref: string | undefined =
    `/v2/blog/${blogName}/posts?limit=100&npf=true&reblog_info=true`;

  do {
    const json = await retry(
      () =>
        pool
          .request({
            method: "GET",
            path: `/api${nextHref}&should_bypass_safemode_forpost=true&should_bypass_safemode_forblog=true&should_bypass_tagfiltering=true&can_modify_safe_mode=true&should_bypass_safemode=true`,
            headers: {
              accept: "application/json;format=camelcase",
              authorization:
                "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
            },
            throwOnError: true,
          })
          .then((response) => response.body.json()),
      {
        onRetry(error, attempt) {
          console.dir({ error, attempt }, { depth: Infinity });
        },
      },
    );
    const data = z
      .object({
        response: z.object({
          links: z
            .object({
              next: z.object({
                href: z.string(),
              }),
            })
            .optional(),
          posts: TumblrPost.array(),
        }),
      })
      .parse(json);

    nextHref = data.response.links?.next.href;

    yield data.response.posts;
  } while (nextHref);
}

export async function fetchBlogPost(
  blogName: string,
  postId: string,
): Promise<TumblrPost> {
  const json = await retry(
    () =>
      pool
        .request({
          method: "GET",
          path: `/api/v2/blog/${blogName}/posts/${postId}/permalink?reblog_info=true`,
          headers: {
            accept: "application/json;format=camelcase",
            authorization:
              "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
            origin: "https://www.tumblr.com",
            referer: "https://www.tumblr.com/",
          },
          throwOnError: true,
        })
        .then((response) => response.body.json()),
    {
      onRetry(e, attempt) {
        console.dir({ e, attempt, blogName, postId }, { depth: Infinity });
      },
    },
  );
  const data = z
    .object({
      response: z.object({
        timeline: z.object({
          elements: z.any().array().length(1),
        }),
      }),
    })
    .parse(json);

  return data.response.timeline.elements[0];
}
