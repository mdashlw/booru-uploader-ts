import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "www.reddit.com" ||
      url.hostname === "reddit.com" ||
      url.hostname === "old.reddit.com") &&
    url.pathname.startsWith("/r/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [
    {
      data: {
        children: [{ data }],
      },
    },
  ] = await fetchAPI(
    `${url}.json`,
    z.tuple([
      z.object({
        kind: z.literal("Listing"),
        data: z.object({
          dist: z.literal(1),
          children: z
            .object({
              kind: z.literal("t3"),
              data: z.object({
                title: z.string(),
                selftext: z.string(),
                created: z
                  .number()
                  .int()
                  .positive()
                  .transform((ts) => ts * 1_000)
                  .pipe(z.coerce.date()),
                author: z.string(),
                permalink: z.string(),
                url: z.string().startsWith("https://i.redd.it/"),
              }),
            })
            .array()
            .length(1),
        }),
      }),
      z.any(),
    ]),
  );

  return {
    source: "Reddit",
    url: `https://www.reddit.com${data.permalink}`,
    images: [await probeImageUrl(data.url)],
    artist: data.author,
    date: formatDate(data.created),
    title: data.title,
    description: data.selftext,
  };
}

async function fetchAPI<T extends z.ZodTypeAny>(
  url: string,
  body: T,
): Promise<z.infer<T>> {
  const oldRedditUrl = new URL(url);
  oldRedditUrl.hostname = "old.reddit.com";
  const response = await undici.request(oldRedditUrl, {
    headers: { "user-agent": "curl" },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
