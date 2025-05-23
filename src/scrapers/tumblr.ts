import * as cheerio from "cheerio";
import timers from "node:timers/promises";
import undici from "undici";
import { type ZipEntry, unzip } from "unzipit";
import { z } from "zod";
import type { SourceData, SourceImageData } from "../scraper/types.ts";
import {
  probeAndValidateImageBlob,
  probeAndValidateImageUrl,
} from "../scraper/utils.ts";
import { lazyInit } from "../utils/lazy-init.ts";
import convertTumblrNpfToMarkdown from "../utils/npf-to-markdown.ts";
import { type ProbeResult } from "../utils/probe-image.ts";
import {
  Blog,
  NpfContentBlock,
  NpfPost,
  V1Post,
  ReblogTrail,
  NpfLayoutBlock,
} from "../utils/tumblr-types.ts";
import { getReblogs } from "../tumblr-archives.ts";
import { getCookieString, setCookies } from "../cookies.ts";

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

const BASE_URL = "https://www.tumblr.com";

const pool = new undici.Pool(BASE_URL);

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
  const blog = blogs.at(-1)!;

  console.log(`[tumblr] [debug] using blog: ${blog.name}`);

  return blog.name;
});

export function canHandle(url: URL): boolean {
  return (
    url.hostname.endsWith(".tumblr.com") ||
    url.hostname === "tumblr.com" ||
    url.hostname === "tmblr.co"
  );
}

async function extractBlogNameAndPostId(url: URL): Promise<[string, string]> {
  let blogName: string, postId: string;

  if (url.hostname === "www.tumblr.com" || url.hostname === "tumblr.com") {
    if (
      url.pathname.startsWith("/blog/view/") ||
      url.pathname.startsWith("/dashboard/blog/")
    ) {
      [, , , blogName, postId] = url.pathname.split("/");
    } else if (url.pathname.startsWith("/blog/private_")) {
      [, , blogName] = url.pathname.split("/");
      postId = url.search.substring(1);
    } else {
      [, blogName, postId] = url.pathname.split("/");
    }
  } else if (url.hostname === "at.tumblr.com") {
    [, blogName, postId] = url.pathname.split("/");

    if (!/^\d+$/.test(postId)) {
      const location = await undici
        .request(url, { throwOnError: true })
        .then((response) => response.headers.location);

      if (typeof location !== "string") {
        throw new Error(`Invalid location header: ${location}`);
      }

      return extractBlogNameAndPostId(new URL(location));
    }
  } else if (url.hostname === "tmblr.co") {
    const location = await undici
      .request(url, { method: "HEAD", throwOnError: true })
      .then((response) => response.headers.location);

    if (typeof location !== "string") {
      throw new Error(`Invalid location header: ${location}`);
    }

    return extractBlogNameAndPostId(new URL(location));
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

  if (blogName.startsWith("@")) {
    blogName = blogName.substring(1);
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

  let content: NpfContentBlock[], layout: NpfLayoutBlock[];

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

    ({ content, layout } = trail);
  } else if (trail) {
    throw new Error("Post is not a reblog but a trail present");
  } else {
    ({ content, layout } = post);
  }

  let v1PostPromise: Promise<V1Post | null> | undefined;
  let backupDataPromise:
    | Promise<{
        reblogPostId: string;
        entries: { [key: string]: ZipEntry };
      }>
    | undefined;

  const mediaContent = content.filter(
    (block) => block.type === "image" || block.type === "video",
  );
  const selectedMediaIndex = url.hash ? Number(url.hash.substring(1)) - 1 : NaN;

  let canonicalUrl = decodeURI(post.postUrl);
  if (post.rebloggedRootUrl) {
    if (
      post.rebloggedRootUrl.startsWith("https://www.tumblr.com/blog/private_")
    ) {
      canonicalUrl = `https://${trail!.blog.name}.tumblr.com/post/${post.rebloggedRootId}`;
    } else {
      canonicalUrl = post.rebloggedRootUrl;
    }
  }

  const images: SourceImageData[] = await Promise.all(
    content
      .filter((block) => block.type === "image")
      .map(async (block, index) => {
        const {
          media: [media],
          altText,
        } = block;

        console.log(`Media #${index + 1}: ${media.url}`);

        if (media.width === undefined || media.height === undefined) {
          throw new Error("Missing media dimensions");
        }

        media.url = media.url.replace(".pnj", ".png");

        let { type } = media;

        if (type === "image/png") {
          type = "png";
        } else if (type === "image/jpeg") {
          type = "jpg";
        } else if (type === "image/webp") {
          type = "gif";
        } else {
          throw new Error(`Unexpected media type: ${type}`);
        }

        let width: number | undefined,
          height: number | undefined,
          probeResult: ProbeResult | undefined;

        if (media.hasOriginalDimensions) {
          width = media.width!;
          height = media.height!;
          probeResult = await probeAndValidateImageUrl(
            media.url,
            undefined,
            width,
            height,
          );
        } else {
          const v1Post = await (v1PostPromise ??
            (v1PostPromise = fetchV1Post(post.blogName, post.idString).catch(
              (error) => {
                if (error.message === "Post not found") {
                  return null;
                }

                throw error;
              },
            )));

          if (v1Post !== null) {
            if (v1Post.type === "regular" || v1Post.type === "answer") {
              const $ = cheerio.load(
                v1Post.type === "regular"
                  ? v1Post["regular-body"]
                  : v1Post.answer,
              );
              const list = $("figure.tmblr-full").map((_, figure) => {
                const $figure = $(figure);
                const width = Number($figure.data("orig-width"));
                const height = Number($figure.data("orig-height"));

                return {
                  width,
                  height,
                };
              });

              ({ width, height } = list[index]);
            } else if (v1Post.type === "photo") {
              const photo = v1Post.photos.length
                ? v1Post.photos[index]
                : v1Post;

              ({ width, height } = photo);
            } else {
              // @ts-ignore
              throw new Error(`Unsupported post type: ${v1Post.type}`);
            }
          } else {
            console.log("v1 failed for", post.postUrl);
            width = media.width! + Math.random();
            height = media.height! + Math.random();
          }

          if (media.mediaKey) {
            probeResult = await probeAndValidateImageUrl(
              await fetchNewImageUrl(
                media.url.replace(/\/s\d+x\d+\//, "/s99999x99999/"),
              ),
              undefined,
              Number.isInteger(width) ? width : undefined,
              Number.isInteger(height) ? height : undefined,
            );
          }
        }

        if (metadataOnly) {
          probeResult = {
            blob: null as any,
            filename: probeResult?.filename,
            type,
            width,
            height,
          };
        } else if (!probeResult || probeResult.type === "jpg") {
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

          probeResult = await probeAndValidateImageBlob(
            blob,
            type,
            Number.isInteger(width) ? width : undefined,
            Number.isInteger(height) ? height : undefined,
          );
          probeResult.filename = entry.name;
        }

        const thisIndex = mediaContent.indexOf(block);
        return {
          ...probeResult,
          pageUrl:
            mediaContent.length > 1
              ? `${canonicalUrl}#${thisIndex + 1}`
              : canonicalUrl,
          selected: selectedMediaIndex === thisIndex,
          description: altText,
        };
      }),
  );

  let artistName = (trail ?? post).blog.name;
  if (/-deactivated\d*$/.test(artistName)) {
    artistName = artistName.substring(0, artistName.lastIndexOf("-"));
  }

  return {
    source: "Tumblr",
    url: canonicalUrl,
    images,
    artist: artistName,
    date: new Date((trail?.post ?? post).timestamp * 1_000),
    title: null,
    description: (booru) =>
      convertTumblrNpfToMarkdown(content, layout, booru.markdown),
    tags: post.tags.map((name) => ({
      name,
      url: `https://www.tumblr.com/${post.blogName}/tagged/${encodeURIComponent(name)}`,
    })),
  };
}

async function fetchNpfPostTryReblogs(
  blogId: string,
  postId: string,
): Promise<NpfPost | undefined> {
  try {
    return await fetchNpfPost(blogId, postId);
  } catch (error: any) {
    if (
      error.code !== "UND_ERR_RESPONSE_STATUS_CODE" ||
      error.statusCode !== 404
    ) {
      throw error;
    }

    console.log(`Post ${postId} not found on ${blogId}. Trying reblogs...`);

    const reblogs = await getReblogs(postId);

    for (const reblog of reblogs) {
      const post = await fetchNpfPostTryReblogs(
        reblog.reblog_blog_uuid,
        reblog.reblog_post_id,
      );

      if (post) {
        console.log(
          `Found reblog: https://www.tumblr.com/${reblog.reblog_blog_name}/${reblog.reblog_post_id}`,
        );
        return post;
      }
    }
  }
}

async function fetchCsrfToken(): Promise<string> {
  const response = await pool.request({
    method: "GET",
    path: "/settings/account",
    headers: {
      accept: "text/html",
      cookie: getCookieString(`${BASE_URL}/`),
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    throwOnError: true,
  });

  await setCookies(`${BASE_URL}/`, response.headers["set-cookie"]);

  const body = await response.body.text();

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
  const response = await undici.request(
    `https://${blogName}.tumblr.com/api/read/json?id=${postId}`,
  );
  const body = await response.body.text();

  if (
    response.statusCode === 404 ||
    (response.statusCode === 302 &&
      (response.headers["location"] as string)?.startsWith(
        "https://www.tumblr.com/safe-mode",
      ))
  ) {
    const num = 50;

    let start = 0;
    let end = 0;

    do {
      const mid = Math.floor((start + end) / 2);

      const response = await undici.request(
        `https://${blogName}.tumblr.com/api/read/json?num=${num}&start=${mid}`,
      );
      const body = await response.body.text();
      const json = JSON.parse(body.slice("var tumblr_api_read = ".length, -2));

      const post = json.posts.find((p: any) => p.id === postId);

      if (post) {
        return V1Post.parse(post);
      }

      if (end === 0) {
        start = num;
        end = json["posts-total"] - num;
        continue;
      }

      if (Number(json.posts[0].id) > Number(postId)) {
        start = mid + num;
      } else {
        end = mid;
      }
    } while (start < end);

    throw new Error("Post not found");
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
  const response = await pool.request({
    method: "GET",
    ...otherOptions,
    path: `/api/v2/${path}`,
    headers: {
      accept: "application/json;format=camelcase",
      authorization:
        "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
      "content-type": "application/json; charset=utf8",
      cookie: csrfToken ? getCookieString(`${BASE_URL}/`) : undefined,
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
      "x-csrf": csrfToken,
      ...options.headers,
    },
    throwOnError: true,
  });

  await setCookies(`${BASE_URL}/`, response.headers["set-cookie"]);

  const json = await response.body.json();
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
