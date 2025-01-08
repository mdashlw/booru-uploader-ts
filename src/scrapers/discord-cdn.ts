import process from "node:process";
import { z } from "zod";
import undici from "undici";
import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "cdn.discordapp.com" ||
    url.hostname === "media.discordapp.net"
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  if (url.hostname === "media.discordapp.net") {
    url.hostname = "cdn.discordapp.com";
  }

  url = await validateAndRefreshAttachmentUrl(url);

  const cleanUrl = new URL(url);
  cleanUrl.search = "";

  return {
    source: null,
    url: cleanUrl.toString(),
    images: [await probeImageUrl(url)],
    artist: null,
    date: null,
    title: null,
    description: null,
  };
}

async function validateAndRefreshAttachmentUrl(url: URL) {
  const refresh = (errorMessage: string) =>
    refreshAttachmentUrls([url.toString()]).then(
      ([{ refreshed }]) => new URL(refreshed),
      (error) => {
        throw new Error(errorMessage, { cause: error });
      },
    );

  const exString = url.searchParams.get("ex");

  if (exString === null) {
    return refresh("unsigned url");
  }

  const exSeconds = Number.parseInt(exString, 16);

  if (Number.isNaN(exSeconds)) {
    return refresh("invalid ex value in url");
  }

  const exMillis = exSeconds * 1_000;

  if (Date.now() > exMillis) {
    return refresh("expired url");
  }

  return url;
}

async function refreshAttachmentUrls(urls: string[]) {
  const token = process.env.DISCORD_CDN_BOT_TOKEN;

  if (token === undefined) {
    throw new Error(
      "Cannot refresh attachment urls: env DISCORD_CDN_BOT_TOKEN is not set",
    );
  }

  const response = await undici.request(
    "https://discord.com/api/v10/attachments/refresh-urls",
    {
      method: "POST",
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attachment_urls: urls,
      }),
      throwOnError: true,
    },
  );
  const json = await response.body.json();
  const data = z
    .object({
      refreshed_urls: z
        .object({
          original: z.string().url(),
          refreshed: z.string().url(),
        })
        .array()
        .length(urls.length),
    })
    .parse(json);

  return data.refreshed_urls;
}
