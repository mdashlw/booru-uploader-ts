import crypto from "node:crypto";
import { match, P } from "ts-pattern";
import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { formatDate } from "../scraper/utils.ts";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.ts";
import { probeImageUrl, type ProbeResult } from "../utils/probe-image.ts";

const Project = z.object({
  tags: z.string().array(),
  assets: z
    .object({
      title: z.string().nullable(),
      image_url: z.string().url(),
      asset_type: z.enum(["cover", "video", "image", "video_clip", "marmoset"]),
    })
    .array(),
  user: z.object({
    username: z.string(),
  }),
  mediums: z
    .object({
      name: z.string(),
    })
    .array(),
  categories: z
    .object({
      name: z.string(),
    })
    .array(),
  title: z.string().trim(),
  description: z.string().trim(),
  permalink: z.string().url(),
  published_at: z.string().pipe(z.coerce.date()),
});
type Project = z.infer<typeof Project>;

const pool = new undici.Pool("https://www.artstation.com", {
  connect: {
    allowH2: true,
    maxVersion: "TLSv1.2",
  },
});

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "artstation.com" ||
    url.hostname.endsWith(".artstation.com")
  );
}

function parseUrl(url: URL) {
  return match(url.pathname.split("/"))
    .with(["", "projects", P.select(P.string.endsWith(".json"))], (s) => ({
      projectId: s.split(".")[0],
    }))
    .with(["", P.union("artwork", "projects"), P.select("projectId")], (v) => v)
    .otherwise(() => {
      throw new Error(`Could not parse URL: ${url}`);
    });
}

export async function scrape(url: URL): Promise<SourceData> {
  const urlInfo = parseUrl(url);
  const project = await fetchProject(urlInfo.projectId);

  return {
    source: "ArtStation",
    url: project.permalink,
    images: await Promise.all(
      project.assets
        .filter((asset) => asset.asset_type === "image")
        .map(async (asset) => {
          const nocache = crypto.randomUUID();
          let finalUrl: string | undefined,
            probeResult: ProbeResult | undefined;

          for (const url of [
            asset.image_url.replace("/large/", "/original/"),
            asset.image_url.replace("/large/", "/4k/"),
            asset.image_url,
          ]) {
            try {
              probeResult = await probeImageUrl(`${url}&nocache=${nocache}`);
              finalUrl = url;
              break;
            } catch (error: any) {
              if (
                error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
                error.statusCode >= 400 &&
                error.statusCode < 500
              ) {
                continue;
              }

              throw error;
            }
          }

          if (!probeResult || !finalUrl) {
            throw new Error("failed to find working asset url");
          }

          finalUrl = finalUrl.replace("cdna.", "cdn.").replace("cdnb.", "cdn.");
          finalUrl = finalUrl.substring(0, finalUrl.indexOf("?"));

          return {
            ...probeResult,
            pageUrl: finalUrl,
            description: asset.title,
          };
        }),
    ),
    artist: project.user.username,
    date: formatDate(project.published_at),
    title: project.title,
    description: (booru) =>
      convertHtmlToMarkdown(project.description, booru.markdown),
    tags: [
      ...project.mediums.map(({ name }) => name),
      ...project.categories.map(({ name }) => name),
      ...project.tags,
    ].map((name) => ({
      name,
      url: `https://www.artstation.com/search?query=${encodeURIComponent(name)}`,
    })),
    imagePageUrlsAreStandalone: true,
  };
}

function fetchProject(projectId: string) {
  return fetchAPI(`/projects/${projectId}.json`, Project);
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await pool.request({
    method: "GET",
    path,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
