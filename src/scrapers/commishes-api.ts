import undici from "undici";
import z from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import probeImageSize from "../utils/probe-image-size.js";

const Upload = z.object({
  id: z.number().int().positive(),
  created: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  title: z.string().nullable(),
  description: z.string().nullable(),
  media: z.object({
    o: z.string().url(),
  }),
  author: z.object({
    id: z.number().int().positive(),
    username: z.string(),
  }),
});
type Upload = z.infer<typeof Upload>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "portfolio.commishes.com" &&
    url.pathname.startsWith("/upload/show/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const uploadId = url.pathname.split("/")[3]!;
  const upload = await fetchUpload(uploadId);

  const { type, width, height } = await probeImageSize(upload.media.o);

  return {
    source: "Commishes",
    url: `https://${url.host}/upload/show/${uploadId}/`,
    images: [
      {
        url: upload.media.o,
        type,
        width,
        height,
      },
    ],
    artist: upload.author.username,
    date: formatDate(upload.created),
    title: upload.title,
    description: upload.description,
  };
}

async function fetchUpload(uploadId: string): Promise<Upload> {
  const response = await undici
    .request(`https://portfolio.commishes.com/upload/show/${uploadId}.json`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.uploadId = uploadId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.uploadId = uploadId;
    error.response = response;
    throw error;
  });

  return Upload.parse(json);
}
