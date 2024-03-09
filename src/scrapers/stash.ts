import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { fetchAPI } from "./deviantart-other.js";

const StashItem = z.object({
  itemid: z.number().positive(),
  stackid: z.number().positive(),
  title: z.string(),
  description: z.literal(null),
  artist_comments: z.string(),
  tags: z.string().array(),
  creation_time: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  files: z
    .object({
      src: z.string().url(),
      height: z.number().int().positive(),
      width: z.number().int().positive(),
    })
    .array()
    .nonempty(),
  submission: z.object({
    resolution: z
      .string()
      .regex(/^\d+x\d+$/)
      .transform((resolution) => ({
        width: Number(resolution.split("x")[0]),
        height: Number(resolution.split("x")[1]),
      })),
  }),
});
type StashItem = z.infer<typeof StashItem>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "sta.sh" ||
    url.hostname === "www.sta.sh" ||
    (url.hostname === "www.deviantart.com" &&
      url.pathname.startsWith("/stash/"))
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const itemId = url.pathname.split("/").pop();

  if (!itemId?.startsWith("0")) {
    throw new Error("Invalid item ID");
  }

  const item = await fetchStashItem(parseInt(itemId, 36)).catch((error) => {
    if (
      error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
      error.statusCode === 400 &&
      error.body.error_code === 0
    ) {
      throw new Error(error.body.error_description);
    }

    throw error;
  });
  const file = item.files.at(-1)!;

  return {
    source: "Sta.sh",
    url: `https://www.deviantart.com/stash/${itemId}`,
    images: [
      await probeAndValidateImageUrl(
        file.src,
        undefined,
        item.submission.resolution.width,
        item.submission.resolution.height,
      ),
    ],
    artist: /_by_(.+)_d/.exec(item.files[0].src)![1],
    date: formatDate(item.creation_time),
    title: item.title,
    description: (booru) =>
      convertHtmlToMarkdown(item.artist_comments, booru.markdown),
  };
}

function fetchStashItem(itemId: number): Promise<StashItem> {
  return fetchAPI(
    `api/v1/oauth2/stash/item/${itemId}`,
    { mature_content: "true", ext_submission: "true" },
    StashItem,
  );
}
