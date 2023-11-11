import process from "node:process";
import undici from "undici";
import z from "zod";
import getIntermediateImageUrl from "../intermediary.js";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

const COOKIE = process.env.PIXIV_COOKIE;

const IllustPage = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  urls: z.object({
    original: z.string().url(),
  }),
});
type IllustPage = z.infer<typeof IllustPage>;

const Illust = z
  .object({
    illustId: z.string(),
    illustTitle: z.string(),
    illustComment: z.string(),
    createDate: z.coerce.date(),
    tags: z.object({
      tags: z
        .object({
          tag: z.string(),
        })
        .array(),
    }),
    userId: z.string(),
    userName: z.string(),
    pageCount: z.number().int().positive(),
    extraData: z.object({
      meta: z.object({
        canonical: z.string().url(),
      }),
    }),
  })
  .merge(IllustPage);
type Illust = z.infer<typeof Illust>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "www.pixiv.net" &&
    (url.pathname.includes("/artworks/") ||
      url.pathname === "/member_illust.php")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const illustId = url.searchParams.has("illust_id")
    ? url.searchParams.get("illust_id")!
    : url.pathname.split("/").pop()!;
  const illust = await fetchIllust(illustId);
  let illustPages: IllustPage[];

  if (illust.pageCount === 1) {
    illustPages = [illust];
  } else {
    illustPages = await fetchIllustPages(illustId);
  }

  let description = illust.illustComment;

  if (illust.tags.tags.length) {
    if (description) {
      description += "\n\n";
    }

    description += illust.tags.tags.map((tag) => `#${tag.tag}`).join(" ");
  }

  return {
    source: "pixiv",
    url: illust.extraData.meta.canonical,
    images: illustPages.map((page) => ({
      url: async () => {
        const response = await undici.request(page.urls.original, {
          headers: { referer: "https://www.pixiv.net/" },
          throwOnError: true,
        });
        const blob = await response.body.blob();
        return await getIntermediateImageUrl(blob);
      },
      type: page.urls.original.substring(
        page.urls.original.lastIndexOf(".") + 1,
      ),
      width: page.width,
      height: page.height,
    })),
    artist: illust.userName,
    date: formatDate(illust.createDate),
    title: illust.illustTitle,
    description,
  };
}

async function fetchAjax<T extends z.ZodType<any, any, any>>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await undici
    .request(`https://www.pixiv.net/ajax/${path}`, {
      headers: {
        cookie: COOKIE,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    })
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

function fetchIllust(illustId: string): Promise<Illust> {
  return fetchAjax(`illust/${illustId}`, Illust);
}

function fetchIllustPages(illustId: string): Promise<IllustPage[]> {
  return fetchAjax(`illust/${illustId}/pages`, IllustPage.array().nonempty());
}
