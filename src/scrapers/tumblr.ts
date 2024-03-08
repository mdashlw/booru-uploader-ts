import process from "node:process";
import timers from "node:timers/promises";
import undici from "undici";
import { ZipEntry, unzip } from "unzipit";
import { z } from "zod";
import { SourceData, SourceImageData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { getReblogs } from "../tumblr-archives/index.js";
import { lazyInit } from "../utils/lazy-init.js";
import convertTumblrNpfToMarkdown from "../utils/npf-to-markdown.js";
import {
  ProbeResult,
  probeImageBlob,
  probeImageUrl,
} from "../utils/probe-image.js";
import { NpfContentBlock, NpfImageBlock } from "../utils/tumblr-npf-types.js";

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
  "photo-caption": z.string(),
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
  name: z.string(),
  url: z.string().url(),
  uuid: z.string().startsWith("t:"),
});
type Blog = z.infer<typeof Blog>;

const ReblogTrail = z.union([
  z.object({
    content: NpfContentBlock.array(),
    post: z.object({
      id: z.string(),
      timestamp: z.number().int().positive(),
    }),
    blog: Blog,
  }),
  z.object({
    content: NpfContentBlock.array(),
    brokenBlog: z.object({
      name: z.string(),
    }),
    post: z.object({}),
  }),
]);
type ReblogTrail = z.infer<typeof ReblogTrail>;

const NpfPost = z.object({
  objectType: z.literal("post"),
  blogName: z.string(),
  blog: Blog,
  idString: z.string(),
  postUrl: z.string().url(),
  timestamp: z.number().int().positive(),
  reblogKey: z.string(),
  tags: z.string().array(),
  content: NpfContentBlock.array(),
  trail: ReblogTrail.array(),
  rebloggedRootId: z.string().optional(),
  rebloggedRootUrl: z.string().url().optional(),
});
type NpfPost = z.infer<typeof NpfPost>;

const getCsrfToken = lazyInit(() => fetchCsrfToken());
const getIntermediaryBlogName = lazyInit(async (csrfToken: string) => {
  const {
    user: { blogs },
  } = await fetchTumblrAPI(
    csrfToken,
    {
      path: "user/info",
    },
    z.object({
      user: z.object({
        blogs: Blog.array().nonempty(),
      }),
    }),
  );
  const blog = blogs[0];

  return blog.name;
});

export function canHandle(url: URL): boolean {
  return url.hostname.endsWith(".tumblr.com") || url.hostname === "tumblr.com";
}

async function extractBlogNameAndPostId(url: URL): Promise<[string, string]> {
  let blogName: string, postId: string;

  if (url.hostname === "www.tumblr.com" || url.hostname === "tumblr.com") {
    if (url.pathname.startsWith("/blog/view/")) {
      [, , , blogName, postId] = url.pathname.split("/");
    } else {
      [, blogName, postId] = url.pathname.split("/");
    }
  } else if (url.hostname === "at.tumblr.com") {
    [, blogName, postId] = url.pathname.split("/");

    if (!/^\d+$/.test(postId)) {
      const location = await undici
        .request(url, { maxRedirections: 1 })
        .then((response) => response.headers.location);

      if (typeof location !== "string") {
        throw new Error(`Invalid location header: ${location}`);
      }

      return extractBlogNameAndPostId(new URL(location));
    }
  } else {
    blogName = url.hostname.slice(0, -".tumblr.com".length);

    if (
      !url.pathname.startsWith("/post/") &&
      !url.pathname.startsWith("/image/")
    ) {
      throw new Error(`Invalid path: ${url.pathname}`);
    }

    [, , postId] = url.pathname.split("/");
  }

  return [blogName, postId];
}

export async function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  const [blogName, postId] = await extractBlogNameAndPostId(url);
  const post = await fetchNpfPostTryReblogs(blogName, postId);

  if (!post) {
    throw new Error("Post not found");
  }

  const trail = post.trail[0] as ReblogTrail | undefined;

  let content: NpfContentBlock[];

  if (post.rebloggedRootId) {
    if (!trail) {
      throw new Error("Post is a reblog but no trail present");
    }

    if ("brokenBlog" in trail) {
      throw new Error("Trail is broken");
    }

    if (trail.post.id !== post.rebloggedRootId) {
      throw new Error("Trail post id does not match reblogged root id");
    }

    content = trail.content;
  } else if (trail) {
    throw new Error("Post is not a reblog but a trail present");
  } else {
    content = post.content;
  }

  let v1Post: V1Post;

  let backupDataPromise:
    | Promise<{
        reblogPostId: string;
        entries: { [key: string]: ZipEntry };
      }>
    | undefined;

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
            v1Post ??= await fetchV1Post(post.blogName, post.idString);
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
            width = media.width + Math.random();
            height = media.height + Math.random();
          }

          if (media.mediaKey) {
            probeResult = await probeImageUrl(
              await fetchNewImageUrl(
                media.url.replace(/\/s\d+x\d+\//, "/s99999x99999/"),
              ),
            );
          } else if (!metadataOnly) {
            if (!backupDataPromise) {
              backupDataPromise = (async () => {
                const csrfToken = await getCsrfToken();

                const reblogPostId = await createReblogPostAsDraft(
                  csrfToken,
                  post,
                );

                await requestBackup(csrfToken);
                const backupDownloadUrl = await pollBackup(csrfToken);

                await deletePost(csrfToken, reblogPostId);

                const { entries } = await unzip(backupDownloadUrl);

                return { reblogPostId, entries };
              })();
            }

            const { reblogPostId, entries } = await backupDataPromise;

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
          } else {
            probeResult = {
              blob: null as any,
              type: undefined as any,
              width,
              height,
            };
          }
        }

        // if (type !== undefined && probeResult.type !== type) {
        //   throw new Error(`Unexpected image type: ${probeResult.type}`);
        // }

        // if (
        //   (width !== undefined && probeResult.width !== width) ||
        //   (height !== undefined && probeResult.height !== height)
        // ) {
        //   throw new Error(
        //     `Unexpected image dimensions: ${probeResult.width}x${probeResult.height}`,
        //   );
        // }

        return probeResult;
      }),
  );

  let canonicalUrl = post.postUrl;
  if (post.rebloggedRootUrl) {
    if (
      post.rebloggedRootUrl.startsWith("https://www.tumblr.com/blog/private_")
    ) {
      canonicalUrl = `https://${trail!.blog.name}.tumblr.com/post/${post.rebloggedRootId}`;
    } else {
      canonicalUrl = post.rebloggedRootUrl;
    }
  }

  let artistName = (trail ?? post).blog.name;
  if (/-deactivated\d{8}$/) {
    artistName = artistName.substring(0, artistName.lastIndexOf("-"));
  }

  return {
    source: "Tumblr",
    url: canonicalUrl,
    images,
    artist: artistName,
    date: formatDate(new Date((trail?.post ?? post).timestamp * 1_000)),
    title: null,
    description: (booru) => {
      let description: string = convertTumblrNpfToMarkdown(
        content,
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

async function fetchNpfPostTryReblogs(
  blogName: string,
  postId: string,
): Promise<NpfPost | undefined> {
  try {
    return await fetchNpfPost(blogName, postId);
  } catch (error: any) {
    if (
      error.message !== "Failed to fetch" ||
      error.cause.code !== "UND_ERR_RESPONSE_STATUS_CODE" ||
      error.cause.statusCode !== 404
    ) {
      throw error;
    }

    console.log(`Post ${postId} not found on ${blogName}. Trying reblogs...`);

    const reblogs = await getReblogs(postId);

    for (const reblog of reblogs) {
      const post = await fetchNpfPostTryReblogs(reblog.blogName, reblog.id);

      if (post) {
        console.log(`Found reblog: ${reblog.postUrl}`);
        return post;
      }
    }
  }
}

async function fetchCsrfToken(): Promise<string> {
  const response = await undici
    .request("https://www.tumblr.com/settings/account", {
      headers: {
        accept: "text/html",
        cookie: COOKIE,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      throw error;
    });
  const body = await response.body.text().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
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

  const match = /"csrfToken":"(.+?)"/.exec(body);

  if (!match) {
    const error: any = new Error("Could not find csrf token");
    error.response = response;
    error.body = body;
    throw error;
  }

  return match[1];
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

async function fetchTumblrAPI<T extends z.ZodTypeAny>(
  csrfToken: string | undefined,
  options: Omit<undici.Dispatcher.RequestOptions, "origin" | "method"> &
    Partial<Pick<undici.Dispatcher.RequestOptions, "method">>,
  body: T,
): Promise<z.infer<T>> {
  const { path, ...otherOptions } = options;
  const response = await undici
    .request(`https://www.tumblr.com/api/v2/${options.path}`, {
      ...otherOptions,
      headers: {
        accept: "application/json;format=camelcase",
        authorization:
          "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
        "content-type": "application/json; charset=utf8",
        cookie: csrfToken ? COOKIE : undefined,
        origin: "https://www.tumblr.com",
        referer: "https://www.tumblr.com/",
        "x-csrf": csrfToken,
        ...options.headers,
      },
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.options = options;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.options = options;
    error.response = response;
    throw error;
  });
  const data = z
    .object({
      meta: z.object({
        status: z.number(),
        msg: z.string(),
      }),
      response: body,
    })
    .parse(json);

  if (data.meta.status < 200 || data.meta.status >= 300) {
    const error: any = new Error(data.meta.msg);
    error.options = options;
    error.response = response;
    error.data = data;
    throw error;
  }

  return data.response;
}

async function fetchNpfPost(blogId: string, postId: string): Promise<NpfPost> {
  const {
    timeline: {
      elements: [post],
    },
  } = await fetchTumblrAPI(
    undefined,
    {
      path: `blog/${blogId}/posts/${postId}/permalink`,
      query: {
        reblog_info: "true",
      },
    },
    z.object({
      timeline: z.object({
        elements: NpfPost.array().length(1),
      }),
    }),
  );

  return post;
}

async function createReblogPostAsDraft(
  csrfToken: string,
  post: NpfPost,
): Promise<string> {
  const intermediaryBlogName = await getIntermediaryBlogName(csrfToken);
  const { id } = await fetchTumblrAPI(
    csrfToken,
    {
      method: "POST",
      path: `blog/${intermediaryBlogName}/posts`,
      body: JSON.stringify({
        state: "draft",
        parent_tumblelog_uuid: post.blog.uuid,
        parent_post_id: post.idString,
        reblog_key: post.reblogKey,
      }),
    },
    z.object({
      id: z.string(),
      state: z.literal("draft"),
    }),
  );

  return id;
}

async function deletePost(csrfToken: string, postId: string) {
  const intermediaryBlogName = await getIntermediaryBlogName(csrfToken);

  await fetchTumblrAPI(
    csrfToken,
    {
      method: "POST",
      path: `blog/${intermediaryBlogName}/post/delete?id=${postId}`,
    },
    z.object({
      id: z.number().positive(),
    }),
  );
}

async function requestBackup(csrfToken: string) {
  const intermediaryBlogName = await getIntermediaryBlogName(csrfToken);
  const { status } = await fetchTumblrAPI(
    csrfToken,
    {
      method: "POST",
      path: `blog/${intermediaryBlogName}/backup`,
    },
    z.object({
      status: z.string(),
    }),
  );

  if (status !== "pending") {
    throw new Error(`Received unexpected status: ${status}`);
  }
}

async function pollBackup(csrfToken: string): Promise<string> {
  const intermediaryBlogName = await getIntermediaryBlogName(csrfToken);

  while (true) {
    const { status, downloadLink } = await fetchTumblrAPI(
      csrfToken,
      {
        path: `blog/${intermediaryBlogName}/backup`,
      },
      z.object({
        status: z.number(),
        downloadLink: z.string().optional(),
      }),
    );

    if (status !== 3) {
      await timers.setTimeout(3_000);
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
