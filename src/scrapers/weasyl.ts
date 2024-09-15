import process from "node:process";
import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { probeImageUrl } from "../utils/probe-image.js";

const Submission = z.object({
  submitid: z.number(),
  title: z.string(),
  owner_login: z.string(),
  media: z.object({
    submission: z
      .object({
        url: z.string().url(),
      })
      .array()
      .length(1),
  }),
  description: z.string(),
  posted_at: z.string().pipe(z.coerce.date()),
  tags: z.string().array(),
  link: z.string().url(),
});
type Submission = z.infer<typeof Submission>;

const pool = new undici.Pool("https://www.weasyl.com");

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "weasyl.com" || url.hostname === "www.weasyl.com") &&
    (url.pathname.startsWith("/submission/") ||
      url.pathname.includes("/submissions/"))
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  let submitid: string;

  if (url.pathname.startsWith("/submission/")) {
    submitid = url.pathname.split("/")[2];
  } else if (url.pathname.includes("/submissions/")) {
    submitid = url.pathname.split("/")[3];
  } else {
    throw new Error("invalid url");
  }

  const submission = await fetchSubmission(submitid);

  return {
    source: "Weasyl",
    url: submission.link,
    images: [await probeImageUrl(submission.media.submission[0].url)],
    artist: submission.owner_login,
    date: formatDate(submission.posted_at),
    title: submission.title,
    description: (booru) =>
      convertHtmlToMarkdown(submission.description, booru.markdown),
    tags: submission.tags.map((name) => ({
      name,
      url: `https://www.weasyl.com/search?q=${encodeURIComponent(name)}`,
    })),
  };
}

function fetchSubmission(submitid: string): Promise<Submission> {
  return fetchAPI(`/submissions/${submitid}/view`, Submission);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const key = process.env.WEASYL_API_KEY;

  if (!key) {
    throw new Error("Missing WEASYL_API_KEY env var");
  }

  const response = await pool.request({
    method: "GET",
    path: `/api${path}`,
    headers: {
      "X-Weasyl-API-Key": key,
    },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
