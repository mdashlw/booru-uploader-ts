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
  readonly userAgent: string;
  readonly maxRetries: number;
  readonly key?: string;
  readonly supportsMultipleSources: boolean;

  private readonly pool: undici.Pool;
  private readonly lock: SemaphoreInterface;

  constructor(
    name: string,
    baseUrl: URL,
    {
      userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      maxRetries = 3,
      key,
      supportsMultipleSources = false,
    }: {
      userAgent?: string;
      maxRetries?: number;
      key?: string;
      supportsMultipleSources?: boolean;
    } = {},
  ) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
    this.maxRetries = maxRetries;
    this.key = key;
    this.supportsMultipleSources = supportsMultipleSources;
    this.pool = new undici.Pool(baseUrl);
    this.lock = new Semaphore(10); // TODO: mutex vs semaphore
    this.fetch = _.memoize(this.fetch.bind(this), (options, retryNumber) =>
      JSON.stringify({
        options,
        retryNumber,
      }),
    );
  }

  abstract get markdown(): MarkdownDialect;

  requireKey(): string {
    if (!this.key) {
      throw new Error("API key is required");
    }

    return this.key;
  }

  async fetch<T>(
    options: undici.Dispatcher.RequestOptions,
    retryNumber = 0,
  ): Promise<T> {
    await this.lock.acquire();

    const query = options.query ?? {};
    if (this.key) {
      query.key = this.key;
    }

    try {
      return await this.pool
        .request({
          ...options,
          query,
          headers: {
            "user-agent": this.userAgent,
            ...options.headers,
          },
          throwOnError: true,
        })
        .then((response) => response.body.json() as T);
    } catch (error: any) {
      console.error(options, error); //todo
      if (
        retryNumber < this.maxRetries &&
        (error.code === "ECONNRESET" ||
          (error instanceof undici.errors.ResponseStatusCodeError &&
            (error.statusCode >= 500 || error.statusCode === 429)))
      ) {
        let retryAfterMs: number = 0;

        if (error instanceof undici.errors.ResponseStatusCodeError) {
          retryAfterMs = 500;

          if (error.statusCode === 429) {
            const headers = error.headers as IncomingHttpHeaders;

            if ("retry-after" in headers) {
              const retryAfterSeconds = Number(headers["retry-after"]);

              retryAfterMs += retryAfterSeconds * 1_000;
            }
          }
        }

        await timers.setTimeout(retryAfterMs);
        return this.fetch(options, retryNumber + 1);
      }

      throw error;
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

    tag = await this.fetch<{ tags: Tag[] }>({
      method: "GET",
      path: "/api/v1/json/search/tags",
      query: {
        per_page: 100,
        q: name,
      },
    }).then(({ tags }) => tags.find((t) => t.name === name) ?? null);

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
  }): Promise<Image>;
}
