import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { lazyInit } from "../utils/lazy-init.js";

const Submission = z.object({
  submission_id: z.coerce.number(),
  keywords: z
    .object({
      keyword_id: z.string().pipe(z.coerce.number()),
      keyword_name: z.string(),
    })
    .array(),
  create_datetime: z.coerce.date(),
  username: z.string(),
  files: z
    .object({
      file_url_full: z.string().url(),
      mimetype: z.string(),
      full_size_x: z.coerce.number(),
      full_size_y: z.coerce.number(),
    })
    .array(),
  description_bbcode_parsed: z.string(),
  title: z.string(),
});
type Submission = z.infer<typeof Submission>;

const sessionId = lazyInit(async () => {
  const username = process.env.INKBUNNY_USERNAME ?? "guest";
  const password = process.env.INKBUNNY_PASSWORD;

  const { sid } = await fetchAPI(
    "/api_login.php",
    {
      sid: undefined,
      username,
      password,
    },
    z.object({
      sid: z.string(),
    }),
  );

  await fetchAPI(
    "/api_userrating.php",
    {
      sid,
      "tag[2]": "yes",
      "tag[3]": "yes",
      "tag[4]": "yes",
      "tag[5]": "yes",
    },
    z.object({
      sid: z.string(),
    }),
  );

  return sid;
});

export function canHandle(url: URL): boolean {
  return url.hostname === "inkbunny.net";
}

export async function scrape(url: URL): Promise<SourceData> {
  let submissionId: number,
    pictureIdx: number = -1;

  if (url.pathname === "/submissionview.php") {
    submissionId = Number(url.searchParams.get("id"));
  } else if (url.pathname.startsWith("/s/")) {
    const [_submissionId, _pictureIdx] = url.pathname.split("/")[2].split("-");

    submissionId = Number(_submissionId);

    if (_pictureIdx === "latest") {
      pictureIdx = 1337;
    } else if (_pictureIdx?.startsWith("p") && _pictureIdx.length > 1) {
      pictureIdx = Number(_pictureIdx.substring(1)) - 1;

      if (Number.isNaN(pictureIdx)) {
        pictureIdx = -1;
      } else if (pictureIdx < 0) {
        pictureIdx = 0;
      }
    }
  } else {
    throw new Error("Invalid URL");
  }

  const submission = await fetchSubmission(submissionId);

  if (pictureIdx === 1337) {
    pictureIdx = submission.files.length - 1;
  } else if (pictureIdx >= submission.files.length) {
    pictureIdx = -1;
  }

  return {
    source: "Inkbunny",
    url: `https://inkbunny.net/s/${submission.submission_id}`,
    images: await Promise.all(
      submission.files.map(async (file, idx, files) => ({
        selected: idx === pictureIdx,
        pageUrl: `https://inkbunny.net/s/${submission.submission_id}${files.length > 1 ? `-p${idx + 1}` : ""}`,
        ...(await probeAndValidateImageUrl(
          file.file_url_full,
          file.mimetype,
          file.full_size_x,
          file.full_size_y,
        )),
      })),
    ),
    artist: submission.username,
    date: formatDate(submission.create_datetime),
    title: submission.title,
    description: (booru) =>
      convertHtmlToMarkdown(
        submission.description_bbcode_parsed,
        booru.markdown,
      ),
    tags: submission.keywords.map(({ keyword_id, keyword_name }) => ({
      name: keyword_name,
      url: `https://inkbunny.net/search_process.php?keyword_id=${keyword_id}`,
    })),
  };
}

async function fetchSubmission(submissionId: number): Promise<Submission> {
  const { submissions } = await fetchAPI(
    "/api_submissions.php",
    {
      submission_ids: submissionId,
      show_description_bbcode_parsed: "yes",
    },
    z.object({
      submissions: Submission.array(),
    }),
  );

  if (!submissions.length) {
    throw new Error("Submission not found");
  }

  return submissions[0];
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  query: Record<string, any>,
  body: T,
): Promise<z.infer<T>> {
  if (!("sid" in query)) {
    query.sid = await sessionId();
  }

  const response = await undici.request(`https://inkbunny.net/${path}`, {
    query,
  });
  const json = await response.body.json();
  const data = z
    .union([
      z.object({
        error_code: z.number(),
        error_message: z.string(),
      }),
      body,
    ])
    .parse(json);

  if ("error_code" in data) {
    throw new Error(`[${data.error_code}] ${data.error_message}`);
  }

  return data;
}
