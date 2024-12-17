import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";

/*
 * Samples:
 * - Safe 1 page: https://www.pixiv.net/en/artworks/85613406
 * - Safe 1 page: https://www.pixiv.net/en/artworks/104188649
 * - Safe 6 pages: https://www.pixiv.net/en/artworks/51278790
 * - Safe 4 pages: https://www.pixiv.net/en/artworks/55387206
 * - NSFW 1 page: https://www.pixiv.net/en/artworks/101972973
 * - NSFW 1 page: https://www.pixiv.net/en/artworks/93454369
 * - NSFW 2 pages: https://www.pixiv.net/en/artworks/41201085
 * - NSFW 2 pages: https://www.pixiv.net/en/artworks/58565901
 */

const User = z.object({
  user_id: z.coerce.number().int().positive(),
  user_name: z.string(),
  user_account: z.string(),
});
type User = z.infer<typeof User>;

const Illust = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string(),
  comment: z.string().nullable(),
  upload_timestamp: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  page_count: z.coerce.number().int().positive(),
  url_big: z.string().url(),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  illust_images: z
    .object({
      illust_image_width: z.coerce.number().int().positive(),
      illust_image_height: z.coerce.number().int().positive(),
    })
    .array()
    .nonempty(),
  manga_a: z
    .object({
      page: z.number().int().nonnegative(),
      url_big: z.string().url(),
    })
    .array()
    .nonempty()
    .optional(),
  tags: z.string().array(),
  meta: z.object({
    canonical: z.string().url(),
  }),
  author_details: User,
});
type Illust = z.infer<typeof Illust>;

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "www.pixiv.net" || url.hostname === "pixiv.net") &&
    (url.pathname.includes("/artworks/") ||
      url.pathname.startsWith("/i/") ||
      url.pathname === "/member_illust.php")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const illustId = url.searchParams.has("illust_id")
    ? url.searchParams.get("illust_id")!
    : url.pathname.split("/").pop()!;
  const illust = await fetchIllust(illustId);
  const illustPages = illust.manga_a?.map(({ page, url_big }) => ({
    url: url_big,
    width: illust.illust_images[page].illust_image_width,
    height: illust.illust_images[page].illust_image_height,
  })) ?? [
    {
      url: illust.url_big,
      width: illust.width,
      height: illust.height,
    },
  ];
  const pageIndex = url.hash ? Number(url.hash.substring(1)) - 1 : -1;

  let description = illust.comment ?? "";

  if (illust.tags.length) {
    if (description) {
      description += "\n\n";
    }

    description += illust.tags.map((tag) => `#${tag}`).join(" ");
  }

  return {
    source: "pixiv",
    url: illust.meta.canonical,
    images: await Promise.all(
      illustPages.map(async (page, index, pages) => ({
        selected: index === pageIndex,
        pageUrl:
          pages.length > 1
            ? `${illust.meta.canonical}#${index + 1}`
            : illust.meta.canonical,
        ...(await probeAndValidateImageUrl(
          page.url,
          undefined,
          page.width,
          page.height,
          { referer: "https://www.pixiv.net/" },
        )),
      })),
    ),
    artist: illust.author_details.user_name,
    date: illust.upload_timestamp,
    title: illust.title,
    description,
  };
}

async function fetchAjax<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await undici
    .request(`https://www.pixiv.net/touch/ajax/${path}`)
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.path = path;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.path = path;
    error.response = response;
    throw error;
  });
  const data = z
    .discriminatedUnion("error", [
      z.object({
        error: z.literal(true),
        message: z.string().min(1),
        body: z.unknown(),
      }),
      z.object({
        error: z.literal(false),
        message: z.string().length(0),
        body,
      }),
    ])
    .parse(json);

  if (data.error) {
    const error: any = new Error(data.message);
    error.path = path;
    error.response = response;
    error.body = json;
    throw error;
  }

  return data.body;
}

async function fetchIllust(illustId: string): Promise<Illust> {
  const { illust_details } = await fetchAjax(
    `illust/details?illust_id=${illustId}`,
    z.object({
      illust_details: Illust,
    }),
  );

  return illust_details;
}
