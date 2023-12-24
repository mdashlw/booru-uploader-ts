import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import probeImageType from "../utils/probe-image-type.js";
import probeImageSize from "../utils/probe-image.js";

// https://github.com/mikf/gallery-dl/blob/32da3c70d3153568eb9aaf5a71ab2875e7767850/gallery_dl/extractor/tumblr.py#L482
const API_KEY = "O3hU2tMi5e4Qs5t3vezEi6L0qRORJ5y9oUpSGsrWu8iA3UCc3B";

interface Post {
  blog_name: string;
  post_url: string;
  date: string;
  summary: string;
  content: (
    | {
        type: "image";
        media: {
          media_key?: string;
          url: string;
          width: number;
          height: number;
          has_original_dimensions?: boolean;
        }[];
      }
    | {
        type: string;
      }
  )[];
}

export function canHandle(url: URL): boolean {
  return url.hostname.endsWith(".tumblr.com");
}

export async function scrape(url: URL): Promise<SourceData> {
  let blog: string, postId: string;

  if (url.hostname === "www.tumblr.com") {
    const match = /^\/(\w+)\/(\d+)/.exec(url.pathname);

    if (!match) {
      const error: any = new Error("Could not match blog and post id");
      error.url = url;
      throw error;
    }

    [, blog, postId] = match;
  } else {
    blog = url.hostname.slice(0, -".tumblr.com".length);

    const match = /^\/post\/(\d+)/.exec(url.pathname);

    if (!match) {
      const error: any = new Error("Could not match post id");
      error.url = url;
      throw error;
    }

    [, postId] = match;
  }

  const post = await fetchPost(blog, postId);

  return {
    source: "Tumblr",
    url: post.post_url,
    images: await Promise.all(
      post.content
        .filter((block) => block.type === "image")
        .map(async (block) => {
          const {
            // @ts-ignore
            media: [media],
          } = block;
          let url: string = media.url;
          let type: string;
          let width: number, height: number;

          if (media.media_key && !media.has_original_dimensions) {
            url = url.replace(/\/s\d+x\d+\//, "/s99999x99999/");

            const body = await undici
              .request(url, {
                headers: {
                  accept: "text/html",
                },
                throwOnError: true,
              })
              .then((response) => response.body.text());

            const match = /" src="(.+?)"/.exec(body);

            if (!match) {
              throw new Error("Could not find new image url");
            }

            [, url] = match;

            console.log("probing", url);
            ({ type, width, height } = await probeImageSize(url));
          } else {
            console.log("not probing", media);
            ({ width, height } = media);
            type = await probeImageType(url);
          }

          return {
            url,
            type,
            width,
            height,
          };
        }),
    ),
    artist: post.blog_name,
    date: formatDate(new Date(post.date)),
    title: null,
    description: post.summary,
  };
}

async function fetchPost(blog: string, postId: string): Promise<Post> {
  const response = await undici
    .request(
      `https://api.tumblr.com/v2/blog/${blog}/posts?api_key=${API_KEY}&id=${postId}&npf=true`,
    )
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.blog = blog;
      error.postId = postId;
      throw error;
    });
  const data = (await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.blog = blog;
    error.postId = postId;
    error.response = response;
    throw error;
  })) as {
    meta: {
      status: number;
      msg: string;
    };
    response: {
      posts: [Post];
    };
  };

  if (data.meta.status !== 200) {
    const error: any = new Error(data.meta.msg);
    error.blog = blog;
    error.postId = postId;
    error.response = response;
    error.data = data;
    throw error;
  }

  const [post] = data.response.posts;

  return post;
}
