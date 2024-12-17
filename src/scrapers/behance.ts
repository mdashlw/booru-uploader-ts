import crypto from "node:crypto";
import type { SourceData } from "../scraper/types.ts";
import undici from "undici";
import { z } from "zod";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";

const Module = z.discriminatedUnion("type", [
  z.object({
    id: z.number(),
    type: z.literal("image"),
    sizes: z.object({
      original: z.string().url(),
    }),
    dimensions: z.object({
      original: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    }),
  }),
  z.object({
    id: z.number(),
    type: z.literal("text"),
  }),
]);
type Module = z.infer<typeof Module>;

const Project = z.object({
  id: z.number(),
  name: z.string(),
  published_on: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  url: z.string().url(),
  owners: z
    .object({
      username: z.string(),
    })
    .array(),
  tags: z.string().array(),
  modules: Module.array(),
});
type Project = z.infer<typeof Project>;

const HOST = "www.behance.net";
const BASE_URL = `https://${HOST}`;

const pool = new undici.Pool(BASE_URL);

export function canHandle(url: URL): boolean {
  return url.hostname === HOST && url.pathname.startsWith("/gallery/");
}

function parseProjectId(url: URL): number {
  if (!url.pathname.startsWith("/gallery/")) {
    throw new Error("invalid url");
  }

  const projectIdString = url.pathname.split("/")[2];
  const projectId = Number(projectIdString);

  if (Number.isNaN(projectId)) {
    throw new Error("invalid project id");
  }

  return projectId;
}

export async function scrape(url: URL): Promise<SourceData> {
  const projectId = parseProjectId(url);
  const { project } = await fetchProject(projectId);

  return {
    source: "Behance",
    url: project.url,
    images: await Promise.all(
      project.modules
        .filter((module) => module.type === "image")
        .map(async (module) => ({
          ...(await probeAndValidateImageUrl(
            module.sizes.original,
            undefined,
            module.dimensions.original.width,
            module.dimensions.original.height,
          )),
          pageUrl: `${project.url}/modules/${module.id}`,
        })),
    ),
    artist: project.owners.map((user) => user.username),
    date: project.published_on,
    title: project.name,
    description: null,
    tags: project.tags.map((name) => ({
      name,
      url: `${BASE_URL}/search/projects/${encodeURIComponent(name)}`,
    })),
  };
}

function fetchProject(projectId: number) {
  return fetchAPI(`/v2/projects/${projectId}`, z.object({ project: Project }));
}

async function fetchAPI<T extends z.ZodTypeAny>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const bcp = crypto.randomUUID();
  const response = await pool.request({
    method: "GET",
    path,
    headers: {
      cookie: `bcp=${bcp}`,
      "x-bcp": bcp,
      "x-requested-with": "XMLHttpRequest",
    },
    throwOnError: true,
  });
  const json = await response.body.json();
  const data = body.parse(json);

  return data;
}
