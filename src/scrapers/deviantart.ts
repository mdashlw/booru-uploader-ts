import Bluebird from "bluebird";
import { DateTime } from "luxon";
import { Blob } from "node:buffer";
import events from "node:events";
import process from "node:process";
import sharp from "sharp";
import undici from "undici";
import { z } from "zod";
import Booru from "../booru/index.js";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { lazyInit } from "../utils/lazy-init.js";
import { ProbeResult } from "../utils/probe-image.js";
import { readableToBuffer } from "../utils/stream.js";
import { ZodLuxonDateTime } from "../utils/zod.js";

const COOKIE = process.env.DEVIANTART_COOKIE;
const CSRF_TOKEN = process.env.DEVIANTART_CSRF_TOKEN;
const CLIENT_ID = process.env.DEVIANTART_CLIENT_ID;
const CLIENT_SECRET = process.env.DEVIANTART_CLIENT_SECRET;

const Deviation = z.object({
  deviationId: z.number(),
  url: z.string().url(),
  title: z.string().trim(),
  publishedTime: ZodLuxonDateTime,
  isDownloadable: z.boolean(),
  author: z.object({
    userId: z.number(),
    username: z.string(),
  }),
  media: z.object({
    baseUri: z.string().url(),
    prettyName: z.string(),
    token: z.string().array().optional(),
    types: z
      .object({
        t: z.string(),
        r: z.number().int(),
        c: z.string().optional(),
        h: z.number().int().positive(),
        w: z.number().int().positive(),
      })
      .array(),
  }),
  extended: z.object({
    deviationUuid: z.string().uuid(),
    originalFile: z.object({
      type: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    tags: z
      .object({
        name: z.string(),
        url: z.string().url(),
      })
      .array()
      .nonempty()
      .optional(),
    descriptionText: z.object({
      excerpt: z.string(),
      html: z.object({
        type: z.enum(["writer", "draft"]),
        markup: z.string(),
      }),
    }),
  }),
});
type Deviation = z.infer<typeof Deviation>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname.endsWith(".deviantart.com") &&
    url.pathname.substring(1).includes("/") &&
    !url.pathname.startsWith("/stash/")
  );
}

function parseDeviationInfo(hostname: string, pathname: string) {
  const match =
    /^\/(?:(?:deviation|view)\/|(?:(?<username>[\w-]+)\/)?art\/[\w-]*?)(?<deviationId>\d+)$/gim.exec(
      pathname,
    );

  if (!match) {
    throw new Error(`Invalid path: ${pathname}`);
  }

  let { username, deviationId } = match.groups!;

  if (
    !username &&
    hostname !== "www.deviantart.com" &&
    hostname.endsWith(".deviantart.com")
  ) {
    username = hostname.substring(0, hostname.indexOf("."));
  }

  return { username, deviationId };
}

export async function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  let { username, deviationId } = parseDeviationInfo(
    url.hostname,
    url.pathname,
  );

  if (!username) {
    url.protocol = "https:";
    const response = await undici.request(url, {
      method: "HEAD",
      maxRedirections: 0,
    });

    if (response.statusCode !== 301) {
      throw new Error(`Invalid redirect status code: ${response.statusCode}`);
    }

    const location = response.headers.location;

    if (!location) {
      throw new Error("Missing location header");
    }

    if (typeof location !== "string" || !URL.canParse(location)) {
      throw new Error(`Invalid location header: ${location}`);
    }

    url = new URL(location);
    ({ username, deviationId } = parseDeviationInfo(
      url.hostname,
      url.pathname,
    ));
  }

  if (!username) {
    throw new Error("Failed to find username");
  }

  const { deviation } = await fetchDeviation(username, deviationId);

  return {
    source: "DeviantArt",
    url: deviation.url,
    images: await extractProbeResult(deviation).then(
      (probeResult) => [probeResult],
      (error) => {
        if (metadataOnly) {
          console.error(`Failed to extract probe result: ${error.message}`);
          return [];
        }

        throw new Error(`Failed to extract probe result: ${error.message}`);
      },
    ),
    artist: deviation.author.username,
    date: formatDate(deviation.publishedTime.toJSDate()),
    title: deviation.title,
    description: extractDescription(deviation),
  };
}

async function extractProbeResult(deviation: Deviation): Promise<ProbeResult> {
  const fullview = deviation.media.types.find((t) => t.t === "fullview");

  if (!fullview) {
    const error: any = new Error("Could not find fullview media file");
    error.deviation = deviation;
    throw error;
  }

  const origify = async () => {
    if (deviation.publishedTime.year > 2019) {
      throw new Error("Cannot origify this deviation: too new");
    }

    const urlBase = "http://orig00.deviantart.net";

    const pool = new undici.Pool(urlBase);

    const urlPathBase = "/0000/";
    const urlPathSuffix = `/${deviation.media.prettyName.substring(0, deviation.media.prettyName.lastIndexOf("_"))}-${deviation.media.prettyName.substring(deviation.media.prettyName.lastIndexOf("_") + 1)}.${deviation.media.baseUri.substring(deviation.media.baseUri.lastIndexOf(".") + 1)}`;

    const now = DateTime.now();

    for (const i of (function* () {
      yield 0;
      for (let i = -1; i > -28; --i) yield i;
      for (let i = 1; i < 28; ++i) yield i;
    })()) {
      const dt = deviation.publishedTime.plus({ days: i });

      if (dt > now) {
        break;
      }

      const paths: string[] = [];

      for (const z of deviation.isDownloadable ? ["f", "i"] : ["i", "f"]) {
        for (let a = 0; a < 16; ++a) {
          for (let b = 0; b < 16; ++b) {
            paths.push(
              `${urlPathBase}${z}/${dt.year}/${dt.ordinal.toString().padStart(3, "0")}/${a.toString(16)}/${b.toString(16)}${urlPathSuffix}`,
            );
          }
        }
      }

      const abortController = new AbortController();
      events.setMaxListeners(Infinity, abortController.signal);

      const probes = await Bluebird.map(
        paths,
        async (path) => {
          if (abortController.signal.aborted) {
            return;
          }

          let response: undici.Dispatcher.ResponseData | undefined;

          for (let attempt = 0; attempt < 5; ++attempt) {
            try {
              response = await pool.request({
                method: "HEAD",
                path,
                maxRedirections: 0,
                signal: abortController.signal,
              });

              if (response.statusCode >= 500) {
                continue;
              }

              break;
            } catch (error: any) {
              if (error.name === "AbortError") {
                return;
              }

              continue;
            }
          }

          const url = `${urlBase}${path}`;

          if (response === undefined) {
            throw new Error(`Failed to request ${url}`);
          }

          await response.body.dump();

          if (response.statusCode === 404) {
            return;
          }

          if (response.statusCode !== 301) {
            throw new Error(
              `Unexpected status code ${response.statusCode} for ${url}`,
            );
          }

          const location = response.headers.location;

          if (typeof location !== "string") {
            throw new Error(`Invalid location header: ${location}`);
          }

          abortController.abort();

          console.log(`[deviantart] [debug] orig url: ${url}`);
          console.log(`[deviantart] [debug] redirects to: ${location}`);

          return await probeAndValidateImageUrl(
            location,
            deviation.extended.originalFile.type,
            deviation.extended.originalFile.width,
            deviation.extended.originalFile.height,
          );
        },
        { concurrency: 16 * 16 },
      );

      const result = probes.find(Boolean);

      if (result) {
        await pool.close();
        return result;
      }
    }

    throw new Error("Failed to find original image");
  };

  const chunkify = async () => {
    if (!fullview.c) {
      throw new Error(
        "Cannot chunkify this deviation: fullview media file has no command string",
      );
    }

    if (deviation.extended.originalFile.type !== "png") {
      throw new Error(
        "Cannot chunkify this deviation: original file type is not png",
      );
    }

    const { width: imageWidth, height: imageHeight } =
      deviation.extended.originalFile;
    const chunkWidth = fullview.w;
    const chunkHeight = fullview.h;

    const image = sharp({
      create: {
        width: imageWidth,
        height: imageHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });

    const chunkPromises = [];

    for (let x = 0; x < imageWidth; x += chunkWidth) {
      for (let y = 0; y < imageHeight; y += chunkHeight) {
        const chunkWidthActual = Math.min(chunkWidth, imageWidth - x);
        const chunkHeightActual = Math.min(chunkHeight, imageHeight - y);

        const chunkUrl = new URL(deviation.media.baseUri);

        chunkUrl.pathname += `/v1/crop/w_${chunkWidthActual},h_${chunkHeightActual},x_${x},y_${y}/chunk.png`;

        if (fullview.r >= 0 && deviation.media.token) {
          chunkUrl.searchParams.set("token", deviation.media.token[fullview.r]);
        }

        chunkPromises.push(
          undici
            .request(chunkUrl, { throwOnError: true })
            .then(async (response) => {
              const chunk = {
                input: await readableToBuffer(response.body),
                left: x,
                top: y,
              };
              const metadata = await sharp(chunk.input).metadata();

              if (!metadata.density) {
                throw new Error("BAD_CHUNK");
              }

              return chunk;
            }),
        );
      }
    }

    let chunks: {
      input: Buffer;
      left: number;
      top: number;
    }[];

    try {
      chunks = await Promise.all(chunkPromises);
    } catch (error: any) {
      if (error.message === "BAD_CHUNK") {
        throw new Error(
          "Could not chunkify this deviation: encountered a bad chunk",
        );
      }

      throw error;
    }

    const buffer = await image.composite(chunks).png().toBuffer();
    const blob = new Blob([buffer]);

    console.log(`[deviantart] [debug] successfully chunkified`);

    return {
      blob,
      filename: "chunked.png",
      type: "png",
      width: imageWidth,
      height: imageHeight,
    };
  };

  console.log(
    `[deviantart] [debug] original file: ${JSON.stringify(deviation.extended.originalFile)}`,
  );
  console.log(`[deviantart] [debug] fullview: ${JSON.stringify(fullview)}`);

  if (
    fullview.w === deviation.extended.originalFile.width &&
    fullview.h === deviation.extended.originalFile.height
  ) {
    const url = new URL(deviation.media.baseUri);

    if (fullview.c) {
      url.pathname += fullview.c.replace(
        "<prettyName>",
        deviation.media.prettyName,
      );
    }

    if (fullview.r >= 0 && deviation.media.token) {
      url.searchParams.set("token", deviation.media.token[fullview.r]);
    }

    console.log(`[deviantart] [debug] fullview url: ${url}`);

    return await probeAndValidateImageUrl(
      url,
      deviation.extended.originalFile.type,
      deviation.extended.originalFile.width,
      deviation.extended.originalFile.height,
    );
  }

  if (deviation.isDownloadable) {
    const download = await apiDownloadDeviation(
      deviation.extended.deviationUuid,
    );

    if (
      download.width !== deviation.extended.originalFile.width ||
      download.height !== deviation.extended.originalFile.height
    ) {
      throw new Error("Download has different dimensions than original file");
    }

    console.log(`[deviantart] [debug] download url: ${download.src}`);

    return await probeAndValidateImageUrl(
      download.src,
      deviation.extended.originalFile.type,
      deviation.extended.originalFile.width,
      deviation.extended.originalFile.height,
    );
  }

  // https://github.com/danbooru/danbooru/blob/a2ab035555bf4bfb67e5cd196134058928af4bf1/app/logical/source/url/deviant_art.rb#L220C57-L220C69
  if (
    deviation.deviationId <= 790_677_560 &&
    deviation.extended.originalFile.type === "png"
  ) {
    const url = new URL(deviation.media.baseUri);
    url.pathname = `/intermediary${url.pathname}`;

    console.log(`[deviantart] [debug] intermediary url: ${url}`);

    try {
      return await probeAndValidateImageUrl(
        url,
        deviation.extended.originalFile.type,
        deviation.extended.originalFile.width,
        deviation.extended.originalFile.height,
      );
    } catch (error: any) {
      if (!error.message.startsWith("Unexpected image ")) {
        throw error;
      }
    }
  }

  try {
    return await origify();
  } catch (error: any) {
    console.error(`[deviantart] [debug] origify error: ${error.message}`);
  }

  try {
    return await chunkify();
  } catch (error: any) {
    console.error(`[deviantart] [debug] chunkify error: ${error.message}`);
  }

  throw new Error("Cannot extract probe result");
}

async function fetchInternalAPI<T extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string>,
  body: T,
): Promise<z.infer<T>> {
  if (!COOKIE || !CSRF_TOKEN) {
    throw new Error("Missing DEVIANTART_COOKIE or DEVIANTART_CSRF_TOKEN env");
  }

  params.csrf_token = CSRF_TOKEN;

  const response = await undici.request(
    `https://www.deviantart.com${path}?${new URLSearchParams(params).toString()}`,
    {
      headers: {
        accept: "application/json",
        cookie: COOKIE,
        referer: "https://www.deviantart.com/",
        origin: "https://www.deviantart.com",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    },
  );
  const json = await response.body.json();

  return body.parse(json);
}

async function fetchDeviation(username: string, deviationid: string) {
  return fetchInternalAPI(
    "/_puppy/dadeviation/init",
    {
      type: "art",
      username,
      deviationid,
      include_session: "",
    },
    z.object({
      deviation: Deviation,
    }),
  );
}

function extractDescription(
  deviation: Deviation,
): string | null | ((booru: Booru) => string) {
  function appendTags(dest: string) {
    if (deviation.extended.tags) {
      if (dest) {
        dest += "\n\n";
      }

      dest += deviation.extended.tags.map((tag) => `#${tag.name}`).join(" ");
    }

    return dest;
  }

  if (deviation.extended.descriptionText.excerpt) {
    return appendTags(deviation.extended.descriptionText.excerpt);
  }

  if (deviation.extended.descriptionText.html.type !== "draft") {
    return (booru) =>
      appendTags(
        convertHtmlToMarkdown(
          deviation.extended.descriptionText.html.markup,
          booru.markdown,
        ),
      );
  }

  return null;
}

const accessToken = lazyInit(async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Missing DEVIANTART_CLIENT_ID or DEVIANTART_CLIENT_SECRET env",
    );
  }

  const { access_token, expires_in } = await fetchAPI(
    "oauth2/token",
    {
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    z.object({
      status: z.literal("success"),
      access_token: z.string(),
      expires_in: z.number().int().positive(),
    }),
    false,
  );

  return {
    value: access_token,
    ttlSeconds: expires_in,
  };
});

function apiDownloadDeviation(deviationUuid: string) {
  return fetchAPI(
    `api/v1/oauth2/deviation/download/${deviationUuid}`,
    { mature_content: "true" },
    z.object({
      src: z.string().url(),
      filename: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  );
}

export async function fetchAPI<T extends z.ZodTypeAny>(
  method: string,
  params: Record<string, string>,
  body: T,
  withAccessToken: boolean = true,
): Promise<z.infer<T>> {
  if (withAccessToken) {
    params.access_token = await accessToken();
  }

  const response = await undici.request(
    `https://www.deviantart.com/${method}?${new URLSearchParams(params).toString()}`,
    {
      headers: {
        accept: "application/json",
      },
      throwOnError: true,
    },
  );
  const json = await response.body.json();

  return body.parse(json);
}
