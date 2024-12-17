import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.ts";

const Status = z.object({
  id: z.string(),
  created_at: z.coerce.date(),
  url: z.string().url(),
  content: z.string(),
  account: z.object({
    username: z.string(),
  }),
  media_attachments: z
    .object({
      id: z.string(),
      type: z.string(),
      url: z.string().url(),
      meta: z.object({
        original: z.object({
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        }),
      }),
    })
    .array(),
  tags: z
    .object({
      name: z.string(),
    })
    .array(),
});
type Status = z.infer<typeof Status>;

export function canHandle(url: URL): boolean {
  return (
    ["socel.net", "equestria.social", "pone.social"].includes(url.hostname) &&
    /^\/@\w+\/\d+$/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const id = url.pathname.split("/").at(-1)!;
  const status = await fetchStatus(url.hostname, id);

  return {
    source: `Mastodon @ ${url.hostname}`,
    url: status.url,
    images: await Promise.all(
      status.media_attachments
        .filter((a) => a.type === "image")
        .map((a) =>
          probeAndValidateImageUrl(
            a.url,
            undefined,
            a.meta.original.width,
            a.meta.original.height,
          ),
        ),
    ),
    artist: status.account.username,
    date: status.created_at,
    title: null,
    description: (booru) =>
      convertHtmlToMarkdown(status.content, booru.markdown),
  };
}

function fetchStatus(host: string, id: string) {
  return fetchAPI(host, `statuses/${id}`, Status);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  host: string,
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await undici.request(`https://${host}/api/v1/${path}`, {
    headers: {
      accept: "application/json",
    },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
