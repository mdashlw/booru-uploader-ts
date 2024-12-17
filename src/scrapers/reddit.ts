import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";

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
                url: z.string().url(),
                gallery_data: z
                  .object({
                    items: z
                      .object({
                        media_id: z.string(),
                      })
                      .array(),
                  })
                  .optional(),
                media_metadata: z
                  .record(
                    z.object({
                      m: z
                        .string()
                        .transform((input) => undici.parseMIMEType(input))
                        .refine(
                          (output) => output !== "failure",
                          "Invalid MIME type",
                        ),
                    }),
                  )
                  .optional(),
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
    images:
      data.gallery_data === undefined
        ? [await probeImageUrl(data.url)]
        : await Promise.all(
            data.gallery_data.items.map((item) =>
              probeImageUrl(
                `https://i.redd.it/${item.media_id}.${data.media_metadata![item.media_id].m.subtype}`,
              ),
            ),
          ),
    artist: data.author,
    date: data.created,
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
  oldRedditUrl.hash = "";
  const response = await undici.request(oldRedditUrl, {
    headers: {
      "user-agent": "node:booru-uploader:v1.0.0 (by /u/mdashlw)",
    },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
