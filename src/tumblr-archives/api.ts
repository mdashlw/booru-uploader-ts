import retry from "async-retry";
import undici from "undici";
import { z } from "zod";
import { NpfContentBlock } from "../utils/tumblr-npf-types.js";

export const TumblrPost = z.object({
  blogName: z.string(),
  blog: z.object({
    uuid: z.string().startsWith("t:"),
  }),
  id: z.string(),
  rebloggedRootId: z.string().optional(),
  rebloggedRootName: z.string().optional(),
  rebloggedRootUuid: z.string().startsWith("t:").optional(),
  content: NpfContentBlock.array(),
  trail: z
    .object({
      content: NpfContentBlock.array(),
    })
    .array(),
});
export type TumblrPost = z.infer<typeof TumblrPost>;

const pool = new undici.Pool("https://www.tumblr.com");

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const json = await retry(
    (bail) =>
      pool
        .request({
          method: "GET",
          path,
          headers: {
            accept: "application/json;format=camelcase",
            authorization:
              "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
            origin: "https://www.tumblr.com",
            referer: "https://www.tumblr.com/",
          },
          throwOnError: true,
        })
        .then((response) => response.body.json())
        .catch((error) => {
          if (
            error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
            error.statusCode === 404
          ) {
            bail(error);
          } else {
            throw error;
          }
        }),
    {
      onRetry(error, attempt) {
        console.error("Failed to fetch Tumblr API", {
          path,
          error,
          attempt,
        });
      },
    },
  );
  const data = z
    .object({
      meta: z.object({
        status: z.number(),
        msg: z.string(),
      }),
      response: body,
    })
    .parse(json);

  if (data.meta.status !== 200) {
    throw new Error(data.meta.msg);
  }

  return data.response;
}

export async function* fetchBlogPosts(
  blogName: string,
): AsyncGenerator<TumblrPost[], void, void> {
  let nextHref: string | undefined =
    `/v2/blog/${blogName}/posts?limit=100&npf=true&reblog_info=true&fields[blogs]=uuid`;

  do {
    const data = await fetchAPI(
      `/api${nextHref}&should_bypass_safemode_forpost=true&should_bypass_safemode_forblog=true&should_bypass_tagfiltering=true&can_modify_safe_mode=true&should_bypass_safemode=true`,
      z.object({
        links: z
          .object({
            next: z.object({
              href: z.string(),
            }),
          })
          .optional(),
        posts: TumblrPost.array(),
      }),
    );

    // cast required because typescript moment
    nextHref = data.links?.next.href as string | undefined;

    yield data.posts;
  } while (nextHref);
}

export async function fetchBlogPost(
  blogId: string,
  postId: string,
): Promise<any> {
  const data = await fetchAPI(
    `/api/v2/blog/${blogId}/posts/${postId}/permalink?reblog_info=true`,
    z.object({
      timeline: z.object({
        elements: z.any().array().length(1),
      }),
    }),
  );

  return data.timeline.elements[0];
}
