import Bluebird from "bluebird";
import { DateTime } from "luxon";
import { Blob } from "node:buffer";
import events from "node:events";
import fs from "node:fs";
import process from "node:process";
import sharp from "sharp";
import undici from "undici";
import { z } from "zod";
import Booru from "../booru/index.js";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { lazyInit } from "../utils/lazy-init.js";
import { probeImageUrl, ProbeResult } from "../utils/probe-image.js";
import { readableToBuffer } from "../utils/stream.js";
import { ZodLuxonDateTime } from "../utils/zod.js";

const COOKIE = process.env.DEVIANTART_COOKIE;
const CSRF_TOKEN = process.env.DEVIANTART_CSRF_TOKEN;
const CLIENT_ID = process.env.DEVIANTART_CLIENT_ID;
const CLIENT_SECRET = process.env.DEVIANTART_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.DEVIANTART_REFRESH_TOKEN;

const Deviation = z.object({
  deviationId: z.number(),
  url: z.string().url().nullable(),
  title: z.string().trim(),
  publishedTime: ZodLuxonDateTime,
  isDownloadable: z.boolean(),
  author: z.object({
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
    deviationUuid: z.string().uuid().nullable(),
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

const DeviationEmbed = z.object({
  title: z.string().trim(),
  url: z.string().url(),
  author_name: z.string(),
  pubdate: ZodLuxonDateTime,
  tags: z.string().optional(),
  description: z.string(),
});
type DeviationEmbed = z.infer<typeof DeviationEmbed>;

const TinEyeMatch = z.object({
  domain: z.string(),
  backlinks: z
    .object({
      url: z.string().url().or(z.string().length(0)),
    })
    .array(),
});
type TinEyeMatch = z.infer<typeof TinEyeMatch>;

export function canHandle(url: URL): boolean {
  return (
    (url.hostname.endsWith(".deviantart.com") &&
      url.pathname.substring(1).includes("/")) ||
    url.hostname === "fav.me" ||
    url.hostname === "orig00.deviantart.net"
  );
}

function parseDeviationIdFromNetUrl(pathname: string) {
  return Number.parseInt(
    pathname
      .split("/")
      .pop()!
      .split(".")
      .shift()!
      .split("-")
      .pop()!
      .substring(1),
    36,
  );
}

function parseDeviationInfo(hostname: string, pathname: string) {
  if (hostname === "fav.me") {
    let deviationId: number;

    if (pathname.startsWith("/d")) {
      deviationId = Number.parseInt(pathname.substring(2), 36);
    } else {
      deviationId = Number(pathname.substring(1));
    }

    return { deviationId };
  }

  if (hostname.endsWith(".deviantart.net")) {
    return {
      deviationId: parseDeviationIdFromNetUrl(pathname),
    };
  }

  if (
    (hostname === "www.deviantart.com" && pathname.startsWith("/stash/0")) ||
    (hostname === "sta.sh" && pathname.startsWith("/0"))
  ) {
    return {
      username: "STASH",
      deviationId: Number.parseInt(pathname.split("/").pop()!, 36),
    };
  }

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

  return {
    username,
    deviationId: Number(deviationId),
  };
}

async function fetchRedirectLocation(url: URL) {
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

  return new URL(location);
}

function fetchCanonicalUrl(deviationId: number) {
  return fetchRedirectLocation(
    new URL(`http://fav.me/d${deviationId.toString(36)}`),
  );
}

export async function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  let { username, deviationId } = parseDeviationInfo(
    url.hostname,
    url.pathname,
  );
  const initialUsername = username;
  let canonicalUrl: URL | undefined;

  if (!username) {
    canonicalUrl = await fetchCanonicalUrl(deviationId);
    ({ username, deviationId } = parseDeviationInfo(
      canonicalUrl.hostname,
      canonicalUrl.pathname,
    ));
  }

  if (!username) {
    throw new Error("Failed to find username");
  }

  const { deviation } = await fetchDeviation(username, deviationId).catch(
    async (error) => {
      if (
        error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
        error.statusCode === 400 &&
        error.body.error === "invalid_request"
      ) {
        if (
          error.body.errorDescription !== `Deviation #${deviationId} not found.`
        ) {
          throw new Error(`Deviation #${deviationId} not found.`);
        }

        const embed = await fetchDeviationEmbed(deviationId);
        const deviation = await convertEmbed(deviationId, embed);

        return { deviation };
      }

      throw error;
    },
  );

  return {
    source: "DeviantArt",
    url:
      deviation.url ??
      canonicalUrl?.href ??
      (await fetchCanonicalUrl(deviationId)).href,
    images: await (
      url.hostname.endsWith(".deviantart.net")
        ? probeAndValidateImageUrl(
            url,
            deviation.extended.originalFile.type,
            deviation.extended.originalFile.width,
            deviation.extended.originalFile.height,
          )
        : extractProbeResult(deviation, initialUsername)
    ).then(
      (probeResult) => [probeResult],
      (error) => {
        if (metadataOnly) {
          console.error(`Failed to extract probe result: ${error.message}`);
          return [];
        }

        throw new Error(`Failed to extract probe result: ${error.message}`, {
          cause: error,
        });
      },
    ),
    artist: deviation.author.username,
    date: formatDate(deviation.publishedTime.toJSDate()),
    title: deviation.title,
    description: extractDescription(deviation),
    tags: deviation.extended.tags,
  };
}

async function extractProbeResult(
  deviation: Deviation,
  initialUsername?: string,
): Promise<ProbeResult> {
  const fullview =
    deviation.media.types.find((t) => t.t === "fullview_unpublished") ??
    deviation.media.types.find((t) => t.t === "fullview");

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
    const urlPathBase = "/0000/";
    const pool = new undici.Pool(urlBase);

    async function probe(abortController: AbortController, path: string) {
      if (abortController.signal.aborted) {
        return;
      }

      let response: undici.Dispatcher.ResponseData | undefined;

      for (let attempt = 0; attempt < 10; ++attempt) {
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
    }

    async function probePaths(paths: string[]) {
      const abortController = new AbortController();
      events.setMaxListeners(Infinity, abortController.signal);

      const probes = await Bluebird.map(
        paths,
        probe.bind(null, abortController),
        { concurrency: 16 * 16 },
      );

      const result = probes.find(Boolean);

      if (result) {
        await pool.close();
        return result;
      }
    }

    const tinEyeMatches = await fetchTinEyeMatches(
      getDeviationFullviewUrl(deviation).href,
    ).catch((error) => {
      console.error("Failed to fetch TinEye matches:", error);
      return [] as const;
    });

    if (tinEyeMatches.length) {
      const paths = Array.from(
        new Set(
          tinEyeMatches
            .filter((match) => match.domain === "deviantart.com")
            .flatMap((match) => match.backlinks)
            .filter(({ url }) => url)
            .map(({ url }) => new URL(url))
            .filter((url) => url.hostname.endsWith(".deviantart.net"))
            .filter(
              (url) =>
                parseDeviationIdFromNetUrl(url.pathname) ===
                deviation.deviationId,
            )
            .map((url) => {
              const segments = url.pathname.split("/");

              while (segments[0] !== "f" && segments[0] !== "i") {
                segments.shift();
              }

              return segments.join("/");
            }),
        ),
      ).map((path) => `${urlPathBase}${path}`);

      if (paths.length) {
        console.log(`[deviantart] [debug] TinEye matches: ${paths.join(", ")}`);

        const result = await probePaths(paths);

        if (result) {
          return result;
        }
      }
    }

    const now = DateTime.now();

    for (const username of initialUsername !== undefined &&
    initialUsername.toLowerCase() !== deviation.author.username.toLowerCase()
      ? [initialUsername, deviation.author.username]
      : [deviation.author.username]) {
      for (const i of (function* () {
        yield 0;
        for (let i = 1; i < 28; ++i) yield i;
        for (let i = -1; i > -28; --i) yield i;
      })()) {
        const dt = deviation.publishedTime.plus({ days: i });

        if (dt > now) {
          break;
        }

        const urlPathSuffix = `/${deviation.media.prettyName.substring(0, deviation.media.prettyName.lastIndexOf(`_by_${deviation.author.username.toLowerCase().replaceAll("-", "_")}`))}_by_${username.toLowerCase().replaceAll("-", "_")}-${deviation.media.prettyName.substring(deviation.media.prettyName.lastIndexOf("_") + 1)}.${deviation.media.baseUri.substring(deviation.media.baseUri.lastIndexOf(".") + 1)}`;
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

        const result = await probePaths(paths);

        if (result) {
          return result;
        }
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
      deviation.extended.deviationUuid!,
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

function getDeviationFullviewUrl(deviation: Deviation) {
  const fullview =
    deviation.media.types.find((t) => t.t === "fullview_unpublished") ??
    deviation.media.types.find((t) => t.t === "fullview");

  if (!fullview) {
    throw new Error("Could not find fullview media file");
  }

  const fullviewUrl = new URL(deviation.media.baseUri);

  if (fullview.c) {
    fullviewUrl.pathname += fullview.c.replace(
      "<prettyName>",
      deviation.media.prettyName,
    );
  }

  if (fullview.r >= 0 && deviation.media.token) {
    fullviewUrl.searchParams.set("token", deviation.media.token[fullview.r]);
  }

  return fullviewUrl;
}

function parseJwtToken<T>(token: string): T {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
}

// Test deviations:
// - https://www.deviantart.com/laymyy/art/Stickers-commission-1066895423
// - https://www.deviantart.com/airiniblock/art/Patreon-reward-for-BlackBow-1067185248
// - https://www.deviantart.com/kjara-grissaecrim/art/Flutterdash-297332951
async function probeOriginalFile({
  baseUri,
  token,
}: {
  baseUri: string;
  token?: string;
}): Promise<{
  type: string;
  width: number;
  height: number;
}> {
  if (token === undefined) {
    return await probeImageUrl(baseUri);
  }

  const {
    aud,
    obj: [[{ path, width, height }]],
  } = parseJwtToken<{
    aud: string[];
    obj: [
      [
        {
          path: string;
          width?: `<=${number}`;
          height?: `<=${number}`;
        },
      ],
    ];
  }>(token);

  if (aud === undefined || path !== new URL(baseUri).pathname) {
    throw new Error(`Invalid image token: ${token}`);
  }

  if (aud.includes("urn:service:file.download")) {
    return await probeImageUrl(`${baseUri}?token=${token}`);
  }

  if (
    !aud.includes("urn:service:image.operations") ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error(`Invalid image token: ${token}`);
  }

  const maxWidth = Number(width.substring(2));
  const maxHeight = Number(height.substring(2));

  const type = baseUri.substring(baseUri.lastIndexOf(".") + 1);

  if (await probeDimensions({ width: maxWidth, height: maxHeight })) {
    return {
      type,
      width: maxWidth,
      height: maxHeight,
    };
  }

  /**
   * @returns whether the original image is equal to or smaller than the given dimensions
   */
  async function probeDimensions({
    width = 0,
    height = 0,
  }: {
    width?: number;
    height?: number;
  }): Promise<boolean> {
    const response = await undici.request(
      `${baseUri}/v1/crop/w_1,h_1,x_${width},y_${height}/probe.png?token=${token}`,
      { method: "HEAD" },
    );

    if (response.statusCode === 400) {
      return true;
    }

    if (response.statusCode !== 200) {
      throw new Error(`Unexpected status code: ${response.statusCode}`);
    }

    return false;
  }

  async function probe(
    dimension: "width" | "height",
    smallest: number,
  ): Promise<number> {
    let biggest = 16_384;

    while (smallest < biggest) {
      const middle = Math.floor((smallest + biggest) / 2);

      if (await probeDimensions({ [dimension]: middle })) {
        biggest = middle;
      } else {
        smallest = middle + 1;
      }
    }

    return smallest;
  }

  return {
    type,
    width: await probe("width", maxWidth),
    height: await probe("height", maxHeight),
  };
}

async function convertUrlToDeviationMedia(
  url: URL,
): Promise<Deviation["media"]> {
  const segments = url.pathname.split("/");
  const basePath = [
    segments.shift(), // first one is empty string
    segments.shift(),
    segments.shift(),
    segments.shift(),
  ].join("/");
  const baseUri = url.origin + basePath;
  const prettyName = segments.pop()?.split("-")[0] ?? "";

  if (url.searchParams.has("token")) {
    const token = url.searchParams.get("token")!;
    const {
      aud,
      obj: [[obj]],
    } = parseJwtToken<{
      aud: string[];
      obj: [
        [
          {
            path: string;
            width?: `<=${number}`;
            height?: `<=${number}`;
          },
        ],
      ];
    }>(token);

    if (obj.path !== basePath) {
      throw new Error("Invalid image token");
    }

    if (aud.includes("urn:service:file.download")) {
      const { width, height } = await probeImageUrl(
        `${baseUri}?token=${token}`,
      );

      return {
        baseUri,
        prettyName,
        token: [token],
        types: [
          {
            t: "fullview",
            r: 0,
            h: height,
            w: width,
          },
        ],
      };
    }

    if (
      !aud.includes("urn:service:image.operations") ||
      obj.width === undefined ||
      obj.height === undefined
    ) {
      throw new Error("Invalid image token");
    }

    const maxWidth = Number(obj.width.substring(2));
    const maxHeight = Number(obj.height.substring(2));

    return {
      baseUri,
      prettyName,
      token: [token],
      types: [
        {
          t: "fullview",
          r: 0,
          c: `/v1/fill/w_${maxWidth},h_${maxHeight}/<prettyName>-fullview.png`,
          h: maxHeight,
          w: maxWidth,
        },
      ],
    };
  }

  const { width, height } = await probeImageUrl(baseUri);

  return {
    baseUri,
    prettyName,
    token: [],
    types: [
      {
        t: "fullview",
        r: -1,
        h: height,
        w: width,
      },
    ],
  };
}

async function convertEmbed(
  deviationId: number,
  embed: DeviationEmbed,
): Promise<Deviation> {
  const media = await convertUrlToDeviationMedia(new URL(embed.url));

  return {
    deviationId,
    url: null,
    title: embed.title,
    publishedTime: embed.pubdate,
    isDownloadable: false,
    author: {
      username: embed.author_name,
    },
    media,
    extended: {
      deviationUuid: null,
      originalFile: await probeOriginalFile({
        baseUri: media.baseUri,
        token: media.token?.[0],
      }),
      tags: embed.tags?.split(", ").map((name) => ({
        name,
        url: `https://www.deviantart.com/tag/${encodeURIComponent(name)}`,
      })),
      descriptionText: {
        excerpt: "",
        html: {
          type: "writer",
          markup: embed.description,
        },
      },
    },
  };
}

async function fetchDeviationEmbed(deviationId: number) {
  const response = await undici.request(
    `https://backend.deviantart.com/oembed?consumer=internal&url=${deviationId}`,
    { throwOnError: true },
  );
  const json = await response.body.json();

  return DeviationEmbed.parse(json);
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

async function fetchDeviation(username: string, deviationid: number) {
  if (username === "STASH") {
    const resp = await undici.request(
      `https://www.deviantart.com/stash/0${deviationid.toString(36)}`,
      {
        dispatcher: new undici.Client("https://www.deviantart.com", {
          connect: {
            allowH2: true,
            maxVersion: "TLSv1.2",
          },
        }),
        headers: {
          accept: "text/html",
          referer: "https://www.deviantart.com/",
          origin: "https://www.deviantart.com",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        throwOnError: true,
      },
    );
    const html = await resp.body.text();
    const match = /window\.__INITIAL_STATE__ *= *(JSON\.parse\(".+"\));/.exec(
      html,
    );

    if (!match) {
      throw new Error("Failed to find __INITIAL_STATE__");
    }

    const json = eval(match[1]);
    const data = z
      .object({
        "@@entities": z.object({
          deviation: z.record(
            Deviation.omit({ extended: true }).extend({
              stashPrivateid: z.number(),
              author: z.number(),
            }),
          ),
          deviationExtended: z.record(Deviation.shape.extended),
          user: z.record(Deviation.shape.author),
        }),
      })
      .parse(json);

    const deviation = Object.values(data["@@entities"].deviation).find(
      (d) => d.stashPrivateid === deviationid,
    )!;
    const deviationExtended =
      data["@@entities"].deviationExtended[deviation.deviationId];
    const user = data["@@entities"].user[deviation.author];

    return {
      deviation: {
        ...deviation,
        extended: deviationExtended,
        author: user,
      },
    };
  }

  return fetchInternalAPI(
    "/_puppy/dadeviation/init",
    {
      type: "art",
      username,
      deviationid: deviationid.toString(),
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
  if (deviation.extended.descriptionText.excerpt) {
    return deviation.extended.descriptionText.excerpt;
  }

  if (deviation.extended.descriptionText.html.type !== "draft") {
    return (booru) =>
      convertHtmlToMarkdown(
        deviation.extended.descriptionText.html.markup,
        booru.markdown,
      );
  }

  return null;
}

const accessToken = lazyInit(async () => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Missing some env vars");
  }

  const { access_token, expires_in, refresh_token } = await fetchAPI(
    "oauth2/token",
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
    },
    z.object({
      status: z.literal("success"),
      access_token: z.string(),
      expires_in: z.number().int().positive(),
      refresh_token: z.string(),
    }),
    false,
  );

  // this is fucking stupid but i don't care
  fs.writeFileSync(
    ".env",
    fs.readFileSync(".env", "utf8").replace(REFRESH_TOKEN, refresh_token),
    "utf8",
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

async function fetchTinEyeMatches(imageUrl: string): Promise<TinEyeMatch[]> {
  const form = new undici.FormData();
  form.append("url", imageUrl);
  const response = await undici.request(
    "https://tineye.com/api/v1/result_json/",
    {
      method: "POST",
      query: {
        sort: "score",
        order: "desc",
      },
      body: form,
      throwOnError: true,
    },
  );
  const json = await response.body.json();
  const data = z
    .object({
      matches: TinEyeMatch.array(),
    })
    .parse(json);

  return data.matches;
}
