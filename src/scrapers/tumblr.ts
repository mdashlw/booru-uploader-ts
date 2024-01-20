import process from "node:process";
import timers from "node:timers/promises";
import undici from "undici";
import { unzip } from "unzipit";
import { z } from "zod";
import { SourceData, SourceImageData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import {
  ProbeResult,
  probeImageBlob,
  probeImageUrl,
} from "../utils/probe-image.js";
import { NpfContentBlock, NpfImageBlock } from "../utils/tumblr-npf-types.js";
import convertTumblrNpfToMarkdown from "../utils/npf-to-markdown.js";

/*
 * Images can be:
 * - inline in regular posts (e.g. https://www.tumblr.com/reddthebat/728288778843832320)
 * - photo posts (e.g. https://www.tumblr.com/magnalunaarts/180595404168)
 *
 * Media can be:
 * - new (/s2048x3072/) (e.g. https://www.tumblr.com/evelili/712623381038727168)
 * - old (tumblr_key_1280.png) (e.g. https://www.tumblr.com/magnalunaarts/180595404168)
 *
 * Samples:
 * - inline original new media - https://www.tumblr.com/reddthebat/728374340590190592 (1693x1616)
 * - inline not original new media - https://www.tumblr.com/reddthebat/728288778843832320 (2891x2029)
 * - photo not original new media - https://www.tumblr.com/evelili/712623381038727168 (3000x3000)
 * - photo not original old media - https://www.tumblr.com/magnalunaarts/180595404168 (3333x2345)
 * - photo original new media - https://www.tumblr.com/magnalunaarts/613853894181797888 (1920x2304)
 *
 * Initial state:
 * - original width/height: none
 * - has_original_dimensions: inline images and photo posts
 * - reblog key: yes
 * - csrf token: yes
 *
 * API v2 (NPF):
 * - original width/height: none
 * - has_original_dimensions: inline images and photo posts
 * - reblog key: yes
 * - csrf token: no
 *
 * API v2 (legacy format):
 * - original width/height: inline images
 * - has_original_dimensions: inline images (kind of)
 * - reblog key: yes
 * - csrf token: no
 *
 * API v1:
 * - original width/height: inline images and photo posts
 * - has_original_dimensions: inline images (kind of)
 * - reblog key: yes
 * - csrf token: no
 */

/*
 * Scraper workflow:
 * 1. Fetch initial state from the post page - used for most things.
 * Best case scenario (has original dimensions) - return the received dimensions and url.
 * 2. Fetch the post via API v1 to get the original dimensions.
 * 2a. If that fails (cannot access nsfw posts via v1), add Math.random() to highest dimensions,
 * since we know the image is bigger than that.
 * 3. If new media, modify the url and fetch the new token.
 * 4. If old media,
 * 4a. Create a draft reblog post of the original post.
 * 4b. Request and fetch the backup.
 * 4c. Delete the reblog post.
 * 4d. Upload the image and return the intermediate url.
 */

const COOKIE = process.env.TUMBLR_COOKIE;

const V1RegularPost = z.object({
  type: z.literal("regular"),
  "regular-body": z.string(),
});
type V1RegularPost = z.infer<typeof V1RegularPost>;

const V1PhotoPost = z.object({
  type: z.literal("photo"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  photos: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .array(),
});
type V1PhotoPost = z.infer<typeof V1PhotoPost>;

const V1AnswerPost = z.object({
  type: z.literal("answer"),
  question: z.string(),
  answer: z.string(),
});
type V1AnswerPost = z.infer<typeof V1AnswerPost>;

const V1Post = z.discriminatedUnion("type", [
  V1RegularPost,
  V1PhotoPost,
  V1AnswerPost,
]);
type V1Post = z.infer<typeof V1Post>;

const Blog = z.object({
  uuid: z.string(),
});
type Blog = z.infer<typeof Blog>;

const NpfPost = z.object({
  objectType: z.literal("post"),
  blogName: z.string(),
  blog: Blog,
  id: z.string(),
  postUrl: z.string().url(),
  timestamp: z.number().int().positive(),
  reblogKey: z.string(),
  tags: z.string().array(),
  content: NpfContentBlock.array(),
  trail: z
    .object({
      content: NpfContentBlock.array(),
      post: z.object({
        id: z.string(),
        timestamp: z.number().int().positive(),
      }),
      blog: Blog,
    })
    .array(),
  rebloggedRootId: z.string().optional(),
  rebloggedRootUrl: z.string().url().optional(),
  rebloggedRootName: z.string().optional(),
});
type NpfPost = z.infer<typeof NpfPost>;

const lazyInit = <T, Args extends any[]>(fn: (...args: Args) => T) => {
  let prom: T | undefined = undefined;
  return (...args: Args) => (prom = prom ?? fn(...args));
};

const getIntermediaryBlogName = lazyInit(
  async (apiUrl: string, csrfToken: string) => {
    const {
      user: { blogs },
    } = await fetchTumblrAPI<{
      user: {
        blogs: { name: string }[];
      };
    }>(apiUrl, csrfToken, {
      path: "user/info",
    });
    const blog = blogs.at(-1)!;

    return blog.name;
  },
);

export function canHandle(url: URL): boolean {
  return url.hostname.endsWith(".tumblr.com");
}

export async function scrape(url: URL): Promise<SourceData> {
  if (url.hostname !== "www.tumblr.com") {
    const blogName = url.hostname.slice(0, -".tumblr.com".length);

    const match = /^\/(?:post|image)\/(.+)/.exec(url.pathname);

    if (!match) {
      const error: any = new Error("Could not match post path");
      error.url = url;
      throw error;
    }

    const [, postPath] = match;

    url = new URL(`https://www.tumblr.com/${blogName}/${postPath}`);
  }

  const {
    apiUrl,
    csrfToken,
    PeeprRoute: {
      initialTimeline: {
        objects: [post],
      },
    },
  } = await extractInitialState(url).catch((error) => {
    if (
      error.message === "Failed to fetch" &&
      error.cause instanceof undici.errors.ResponseStatusCodeError &&
      error.cause.statusCode === 404
    ) {
      throw new Error("Post does not exist");
    }

    throw error;
  });

  if (post.trail.length > 1) {
    throw new Error("Deeply nested posts are not supported");
  }

  let content: NpfContentBlock[];

  if (post.rebloggedRootId) {
    const [trail] = post.trail;

    if (trail.post.id !== post.rebloggedRootId) {
      throw new Error("Trail post id does not match reblogged root id");
    }

    content = trail.content;
  } else {
    content = post.content;
  }

  let v1Post: V1Post;

  const images: SourceImageData[] = await Promise.all(
    content
      .filter((block): block is NpfImageBlock => block.type === "image")
      .map(async (block, index) => {
        const {
          media: [media],
        } = block;
        let type: string | undefined,
          width: number | undefined,
          height: number | undefined,
          probeResult: ProbeResult;

        media.url = media.url.replace(".pnj", ".png");

        if (media.hasOriginalDimensions) {
          width = media.width;
          height = media.height;
          probeResult = await probeImageUrl(media.url);
        } else {
          try {
            v1Post ??= await fetchV1Post(post.blogName, post.id);
          } catch (error: any) {
            if (
              error.message === "Cannot access nsfw posts" ||
              (error.message === "Failed to fetch" &&
                error.cause instanceof undici.errors.ResponseStatusCodeError &&
                error.cause.statusCode === 404)
            ) {
              // no-op
            } else {
              throw error;
            }
          }

          if (v1Post) {
            if (v1Post.type === "regular") {
              const match = Array.from(
                v1Post["regular-body"].matchAll(
                  /<img src=".+?" data-orig-height="(\d+)" data-orig-width="(\d+)"/g,
                ),
              )[index];

              width = Number(match[2]);
              height = Number(match[1]);
            } else if (v1Post.type === "answer") {
              const match = Array.from(
                v1Post.answer.matchAll(
                  /<img src=".+?" alt="image" data-orig-width="(\d+)" data-orig-height="(\d+)"/g,
                ),
              )[index];

              width = Number(match[1]);
              height = Number(match[2]);
            } else if (v1Post.type === "photo") {
              if (v1Post.photos.length) {
                ({ width, height } = v1Post.photos[index]);
              } else {
                ({ width, height } = v1Post);
              }
            } else {
              // @ts-ignore
              throw new Error(`Unsupported post type: ${v1Post.type}`);
            }
          } else {
            // TODO: try to use v2 api it has original dimensions for inline images
            // TODO: upd: it appears fetching v1 only fails for photo posts
            width = undefined;
            height = undefined;
          }

          // @ts-ignore
          if (post.isNsfw) {
            console.log(
              // @ts-ignore
              `Post ${post.postUrl} isNsfw=${post.isNsfw} classification=${
                // @ts-ignore
                post.classification
                // @ts-ignore
              } type=${post.type} originalType=${
                // @ts-ignore
                post.originalType
              } v1_failed=${v1Post ? "no" : "yes"}`,
            );
          }

          if (media.mediaKey) {
            probeResult = await probeImageUrl(
              await fetchNewImageUrl(
                media.url.replace(/\/s\d+x\d+\//, "/s99999x99999/"),
              ),
            );
          } else {
            const reblogPostId = await createReblogPostAsDraft(
              apiUrl,
              csrfToken,
              post,
            );

            await requestBackup(apiUrl, csrfToken);
            const backupDownloadUrl = await pollBackup(apiUrl, csrfToken);

            await deletePost(apiUrl, csrfToken, reblogPostId);

            const { entries } = await unzip(backupDownloadUrl);
            const findEntry = (baseKey: string) =>
              Object.entries(entries).find(([key]) =>
                key.startsWith(baseKey),
              )?.[1];

            const entryIndex =
              index - Number(Boolean(findEntry(`media/${reblogPostId}.`)));
            const baseEntryKey =
              entryIndex !== -1
                ? `media/${reblogPostId}_${entryIndex}`
                : `media/${reblogPostId}`;
            const entry = findEntry(`${baseEntryKey}.`);

            if (!entry) {
              const error: any = new Error(
                "Could not find entry in the backup archive",
              );
              error.entries = entries;
              error.entryIndex = entryIndex;
              error.baseEntryKey = baseEntryKey;
              throw error;
            }

            const blob = await entry.blob();

            probeResult = await probeImageBlob(blob);
          }
        }

        if (type !== undefined && probeResult.type !== type) {
          throw new Error(`Unexpected image type: ${probeResult.type}`);
        }

        if (
          (width !== undefined && probeResult.width !== width) ||
          (height !== undefined && probeResult.height !== height)
        ) {
          throw new Error(
            `Unexpected image dimensions: ${probeResult.width}x${probeResult.height}`,
          );
        }

        return probeResult;
      }),
  );

  return {
    source: "Tumblr",
    url: post.rebloggedRootUrl ?? post.postUrl,
    images,
    artist: post.rebloggedRootName ?? post.blogName,
    date: formatDate(
      new Date((post.trail[0]?.post.timestamp ?? post.timestamp) * 1_000),
    ),
    title: null,
    description: (booru) => {
      let description: string = convertTumblrNpfToMarkdown(
        post.content,
        booru.markdown,
      );

      if (post.tags.length) {
        if (description) {
          description += "\n\n";
        }

        description += post.tags.map((tag) => `#${tag}`).join(" ");
      }

      return description;
    },
  };
}

async function extractInitialState(url: URL): Promise<{
  apiUrl: string;
  csrfToken: string;
  PeeprRoute: {
    initialTimeline: {
      objects: NpfPost[];
    };
  };
}> {
  const response = await undici
    .request(url, {
      headers: {
        accept: "text/html",
        "accept-language": "en-us",
        "cache-control": "no-cache",
        cookie: COOKIE,
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
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.url = url;
      throw error;
    });
  const body = await response.body.text().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.url = url;
    error.response = response;
    throw error;
  });

  if (response.headers["set-cookie"]) {
    const setCookie = response.headers["set-cookie"];
    const cookies = new Map(
      (Array.isArray(setCookie) ? setCookie : [setCookie]).map(
        (c) => c.split("; ")[0].split("=") as [string, string],
      ),
    );

    if (cookies.has("logged_in") && cookies.get("logged_in") !== "1") {
      const error: any = new Error("Invalid tumblr cookies");
      error.response = response;
      throw error;
    }
  }

  const match = /window\['___INITIAL_STATE___'] = (.+);/.exec(body);

  if (!match) {
    const error: any = new Error("Could not find initial state");
    error.url = url;
    error.response = response;
    error.body = body;
    throw error;
  }

  const data = eval(`(${match[1]})`);

  return z
    .object({
      apiUrl: z.string().url(),
      csrfToken: z.string(),
      PeeprRoute: z.object({
        initialTimeline: z.object({
          objects: NpfPost.array().length(1),
        }),
      }),
    })
    .parse(data);
}

async function fetchV1Post(blogName: string, postId: string): Promise<V1Post> {
  const response = await undici
    .request(`https://${blogName}.tumblr.com/api/read/json?id=${postId}`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.blogName = blogName;
      error.postId = postId;
      throw error;
    });
  const body = await response.body.text().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.blogName = blogName;
    error.postId = postId;
    error.response = response;
    throw error;
  });

  if (
    response.statusCode === 302 &&
    (response.headers["location"] as string)?.startsWith(
      "https://www.tumblr.com/safe-mode",
    )
  ) {
    const error: any = new Error("Cannot access nsfw posts");
    error.blogName = blogName;
    error.postId = postId;
    error.response = response;
    throw error;
  }

  let data: any;

  try {
    data = JSON.parse(body.slice("var tumblr_api_read = ".length, -2));
  } catch (error: any) {
    error = new Error("Failed to parse data", { cause: error });
    error.blogName = blogName;
    error.postId = postId;
    error.response = response;
    error.body = body;
    throw error;
  }

  return z
    .object({
      posts: V1Post.array().length(1),
    })
    .parse(data).posts[0];
}

async function fetchTumblrAPI<T>(
  apiUrl: string,
  csrfToken: string,
  options: Omit<undici.Dispatcher.RequestOptions, "origin" | "method"> &
    Partial<Pick<undici.Dispatcher.RequestOptions, "method">>,
): Promise<T> {
  const { path, ...otherOptions } = options;
  const response = await undici
    .request(`${apiUrl}/v2/${options.path}`, {
      ...otherOptions,
      headers: {
        accept: "application/json;format=camelcase",
        "accept-language": "en-us",
        authorization:
          "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=utf8",
        cookie: COOKIE,
        dnt: "1",
        origin: "https://www.tumblr.com",
        pragma: "no-cache",
        referer: "https://www.tumblr.com/",
        "sec-ch-ua":
          '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
        "x-ad-blocker-enabled": "0",
        "x-csrf": csrfToken,
        "x-version": "redpop/3/0//redpop/",
        ...options.headers,
      },
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.apiUrl = apiUrl;
      error.csrfToken = csrfToken;
      error.options = options;
      throw error;
    });
  const data = (await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.apiUrl = apiUrl;
    error.csrfToken = csrfToken;
    error.options = options;
    error.response = response;
    throw error;
  })) as {
    meta: {
      status: number;
      msg: string;
    };
    response: T;
  };

  if (data.meta.status < 200 || data.meta.status >= 300) {
    const error: any = new Error(data.meta.msg);
    error.apiUrl = apiUrl;
    error.csrfToken = csrfToken;
    error.options = options;
    error.response = response;
    error.data = data;
    throw error;
  }

  return data.response;
}

async function createReblogPostAsDraft(
  apiUrl: string,
  csrfToken: string,
  post: NpfPost,
): Promise<string> {
  const intermediaryBlogName = await getIntermediaryBlogName(apiUrl, csrfToken);
  const { id } = await fetchTumblrAPI<{ id: string }>(apiUrl, csrfToken, {
    method: "POST",
    path: `blog/${intermediaryBlogName}/posts`,
    body: JSON.stringify({
      state: "draft",
      parent_tumblelog_uuid: post.blog.uuid,
      parent_post_id: post.id,
      reblog_key: post.reblogKey,
    }),
  });

  return id;
}

async function deletePost(apiUrl: string, csrfToken: string, postId: string) {
  const intermediaryBlogName = await getIntermediaryBlogName(apiUrl, csrfToken);

  await fetchTumblrAPI(apiUrl, csrfToken, {
    method: "POST",
    path: `blog/${intermediaryBlogName}/post/delete?id=${postId}`,
  });
}

async function requestBackup(apiUrl: string, csrfToken: string) {
  const intermediaryBlogName = await getIntermediaryBlogName(apiUrl, csrfToken);
  const { status } = await fetchTumblrAPI<{ status: string }>(
    apiUrl,
    csrfToken,
    {
      method: "POST",
      path: `blog/${intermediaryBlogName}/backup`,
    },
  );

  if (status !== "pending") {
    throw new Error(`Received unexpected status: ${status}`);
  }
}

async function pollBackup(apiUrl: string, csrfToken: string): Promise<string> {
  const intermediaryBlogName = await getIntermediaryBlogName(apiUrl, csrfToken);

  while (true) {
    const { status, downloadLink } = await fetchTumblrAPI<{
      status: number;
      downloadLink?: string;
    }>(apiUrl, csrfToken, {
      path: `blog/${intermediaryBlogName}/backup`,
    });

    if (status !== 3) {
      await timers.setTimeout(1_000);
      continue;
    }

    return downloadLink!;
  }
}

async function fetchNewImageUrl(url: string): Promise<string> {
  const response = await undici.request(url, {
    headers: {
      accept: "text/html",
    },
    throwOnError: true,
  });
  const body = await response.body.text();
  const match = /" src="(.+?)"/.exec(body);

  if (!match) {
    const error: any = new Error("Could not find new image url");
    error.url = url;
    error.response = response;
    error.body = body;
    throw error;
  }

  return match[1];
}
