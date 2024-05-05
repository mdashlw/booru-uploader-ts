import child_process from "node:child_process";
import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { probeImageUrl } from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return url.hostname === "www.reddit.com" && url.pathname.startsWith("/r/");
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
  const curl = child_process.spawnSync("curl", ["-s", url], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const json = JSON.parse(curl.stdout);

  console.log(json);

  return body.parse(json);
}
