import undici from "undici";
import { z } from "zod";
import retry from "async-retry";

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

const pool = new undici.Pool("https://api.tumblr.com");

export async function* fetchBlogPosts(
  blogName: string,
): AsyncGenerator<TumblrPost[], void, void> {
  let nextHref: string | undefined =
    `/v2/blog/${blogName}/posts?limit=100&npf=true&reblog_info=true`;

  do {
    const json = await retry(() =>
      pool
        .request({
          method: "GET",
          path: `${nextHref}&should_bypass_safemode_forpost=true&should_bypass_safemode_forblog=true&should_bypass_tagfiltering=true&can_modify_safe_mode=true&should_bypass_safemode=true`,
          headers: {
            accept: "application/json;format=camelcase",
            authorization:
              "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
          },
          throwOnError: true,
        })
        .then((response) => response.body.json()),
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
