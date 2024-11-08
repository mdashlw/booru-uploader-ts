import type { SourceData } from "../scraper/types.ts";
import child_process from "node:child_process";
import process from "node:process";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.ts";

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

  const post = data[1][2];

  return {
    source: "Instagram",
    url: post.post_url,
    images: [
      await probeAndValidateImageUrl(
        post.display_url,
        post.extension,
        post.width,
        post.height,
      ),
    ],
    artist: post.username,
    date: formatDate(new Date(post.post_date.replace(" ", "T") + "Z")),
    title: null,
    description: post.description,
  };
}
