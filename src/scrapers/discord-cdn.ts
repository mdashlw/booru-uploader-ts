import process from "node:process";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return url.hostname === "cdn.discordapp.com";
}

export async function scrape(url: URL): Promise<SourceData> {
  url = await validateAndRefreshAttachmentUrl(url);

  const cleanUrl = new URL(url);
  cleanUrl.search = "";

  const lastModifiedString = await undici
    .request(url, {
      method: "HEAD",
      throwOnError: true,
    })
    .then((response) => response.headers["last-modified"]);
  if (typeof lastModifiedString !== "string") {
    throw new Error(`Invalid last-modified header: ${lastModifiedString}`);
  }
  const lastModified = new Date(lastModifiedString);

  return {
    source: "Discord",
    url: cleanUrl.toString(),
    images: [await probeImageUrl(url)],
    artist: null,
    date: formatDate(lastModified),
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
  const json = (await response.body.json()) as {
    refreshed_urls: {
      original: string;
      refreshed: string;
    }[];
  };

  return json.refreshed_urls;
}
