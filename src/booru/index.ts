import { Semaphore, type SemaphoreInterface } from "async-mutex";
import _ from "lodash";
import { Blob } from "node:buffer";
import timers from "node:timers/promises";
import undici from "undici";
import type { IncomingHttpHeaders } from "undici/types/header.ts";
import type {
  AutocompletedTag,
  Image,
  MarkdownDialect,
  Tag,
  TagName,
  TagSlug,
} from "./types.ts";

export function convertTagNameToSlug(name: TagName): TagSlug {
  return name
    .replaceAll("-", "-dash-")
    .replaceAll("/", "-fwslash-")
    .replaceAll("\\", "-bwslash-")
    .replaceAll(":", "-colon-")
    .replaceAll(".", "-dot-")
    .replaceAll("+", "-plus-")
    .replaceAll(" ", "+")
    .replace(
      /[!'()<>]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    ) as TagSlug;
}

export default abstract class Booru {
  readonly name: string;
  readonly baseUrl: URL;
  readonly key?: string;
  readonly supportsMultipleSources: boolean;

  private readonly dispatcher: undici.Dispatcher;
  private readonly lock: SemaphoreInterface;

  constructor(
    name: string,
    baseUrl: URL,
    {
      key,
      supportsMultipleSources = false,
    }: {
      key?: string;
      supportsMultipleSources?: boolean;
    } = {},
  ) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.key = key;
    this.supportsMultipleSources = supportsMultipleSources;
    this.dispatcher = new undici.Pool(baseUrl).compose(
      undici.interceptors.retry(),
      undici.interceptors.responseError(),
    );
    this.lock = new Semaphore(8);
    this.fetch = _.memoize(this.fetch.bind(this), (options) =>
      JSON.stringify(options),
    );
  }

  abstract get markdown(): MarkdownDialect;

  requireKey(): string {
    if (!this.key) {
      throw new Error("API key is required");
    }

    return this.key;
  }

  async fetch<T>(options: undici.Dispatcher.RequestOptions): Promise<T> {
    await this.lock.acquire();

    const query = options.query ?? {};
    if (this.key) {
      query.key = this.key;
    }

    try {
      const response = await this.dispatcher.request({
        ...options,
        query,
        headers: {
          "user-agent":
            "booru-uploader-ts (https://github.com/mdashlw/booru-uploader-ts)",
          ...options.headers,
        },
      });
      const json = await response.body.json();

      return json as T;
    } finally {
      this.lock.release();
    }
  }

  abstract autocompleteTags(term: string): Promise<AutocompletedTag[]>;

  async fetchImage(id: number): Promise<Image | null> {
    try {
      return (
        await this.fetch<{ image: Image }>({
          method: "GET",
          path: `/api/v1/json/images/${id}`,
        })
      ).image;
    } catch (error: any) {
      if (
        error instanceof undici.errors.ResponseStatusCodeError &&
        error.statusCode === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async fetchTagBySlug(slug: TagSlug): Promise<Tag | null> {
    try {
      return (
        await this.fetch<{ tag: Tag }>({
          method: "GET",
          path: `/api/v1/json/tags/${encodeURIComponent(slug)}`,
        })
      ).tag;
    } catch (error: any) {
      if (
        error instanceof undici.errors.ResponseStatusCodeError &&
        error.statusCode === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async fetchTagByName(name: TagName): Promise<Tag | null> {
    name = name.toLowerCase() as TagName;

    const convertedSlug = convertTagNameToSlug(name);
    let tag = await this.fetchTagBySlug(convertedSlug);

    if (tag) {
      return tag;
    }

    tag =
      (
        await this.fetch<{ tags: Tag[] }>({
          method: "GET",
          path: "/api/v1/json/search/tags",
          query: {
            per_page: 100,
            q: name,
          },
        })
      ).tags.find((t) => t.name === name) ?? null;

    return tag;
  }

  // todo remove
  // async searchImages({
  //   query,
  //   sort,
  //   limit = -1,
  // }: {
  //   query: string;
  //   sort?: [string, string] | string;
  //   limit?: number;
  // }): Promise<Image[]> {
  //   const images: Image[] = [];

  //   for (let page = 1; ; page++) {
  //     const data = await this.fetch<{ total: number; images: Image[] }>({
  //       method: "GET",
  //       path: "/api/v1/json/search/images",
  //       query: {
  //         page,
  //         per_page: 50,
  //         filter_id: "56027",
  //         q: query,
  //         sf: sort ? (Array.isArray(sort) ? sort[0] : sort) : undefined,
  //         sd: sort && Array.isArray(sort) ? sort[1] : undefined,
  //       },
  //     });

  //     images.push(...data.images);

  //     if (
  //       !data.images ||
  //       images.length >=
  //         (limit === -1 ? data.total : Math.min(data.total, limit))
  //     ) {
  //       break;
  //     }
  //   }

  //   if (limit !== -1 && images.length > limit) {
  //     return images.slice(0, limit);
  //   }

  //   return images;
  // }

  abstract postImage(options: {
    blob: Blob;
    filename: string | undefined;
    tags: string[];
    sourceUrls?: string[];
    sourceUrl?: string;
    description?: string;
    anonymous?: boolean;
  }): Promise<Image>;
}
