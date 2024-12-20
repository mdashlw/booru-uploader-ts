import type { SourceData } from "../scraper/types.ts";
import child_process from "node:child_process";
import process from "node:process";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";

const COOKIES_PATH = process.env.INSTAGRAM_COOKIES_PATH;

export function canHandle(url: URL): boolean {
  return url.hostname === "www.instagram.com" && url.pathname.startsWith("/p/");
}

export async function scrape(url: URL): Promise<SourceData> {
  if (!COOKIES_PATH) {
    throw new Error("env INSTAGRAM_COOKIES_PATH not set");
  }

  const dl = child_process.spawnSync(
    "gallery-dl",
    ["--dump-json", "--cookies", COOKIES_PATH, url.href],
    {
      stdio: ["ignore", "pipe", 1],
      encoding: "utf8",
    },
  );
  const data = JSON.parse(dl.stdout.trim());

  if (!data.length) {
    throw new Error("post not found");
  }

  let img_index = Number(url.searchParams.get("img_index"));

  if (Number.isNaN(img_index) || img_index <= 0) {
    img_index = -1;
  } else {
    img_index -= 1;
  }

  const post = data[0][1];

  return {
    source: "Instagram",
    url: post.post_url,
    images: await Promise.all(
      data
        .slice(1)
        .map(async ([_a, _b, image]: [any, any, any], i: number) => ({
          ...(await probeAndValidateImageUrl(
            image.display_url,
            undefined,
            image.width,
            image.height,
          )),
          selected: i === img_index,
        })),
    ),
    artist: post.username,
    date: new Date(post.post_date.replace(" ", "T") + "Z"),
    title: null,
    description: post.description,
  };
}
