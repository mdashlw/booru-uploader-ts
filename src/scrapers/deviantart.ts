import * as cheerio from "cheerio";
import fs from "node:fs";
import process from "node:process";
import undici from "undici";
import { z } from "zod";
import Booru from "../booru/index.ts";
import type { SourceData } from "../scraper/types.ts";
import {
  probeAndValidateImageUrl,
  validateProbeResult,
} from "../scraper/utils.ts";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.ts";
import { lazyInit } from "../utils/lazy-init.ts";
import { type ProbeResult } from "../utils/probe-image.ts";
import { ZodLuxonDateTime } from "../utils/zod.ts";

const COOKIE = process.env.DEVIANTART_COOKIE;
const CSRF_TOKEN = process.env.DEVIANTART_CSRF_TOKEN;
const CLIENT_ID = process.env.DEVIANTART_CLIENT_ID;
const CLIENT_SECRET = process.env.DEVIANTART_CLIENT_SECRET;

if (process.env.DEVIANTART_REFRESH_TOKEN) {
  let oauth: any;

  try {
    oauth = JSON.parse(fs.readFileSync("oauth.json", "utf8"));
  } catch {
    oauth = {};
  }

  oauth.deviantart = { refreshToken: process.env.DEVIANTART_REFRESH_TOKEN };
  fs.writeFileSync("oauth.json", JSON.stringify(oauth), "utf8");
  fs.writeFileSync(
    ".env",
    fs
      .readFileSync(".env", "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("DEVIANTART_REFRESH_TOKEN="))
      .join("\n"),
    "utf8",
  );
}

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
      filesize: z.number().int().positive(),
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
        type: z.enum(["writer", "draft", "tiptap"]),
        markup: z.string(),
      }),
    }),
  }),
});
type Deviation = z.infer<typeof Deviation>;

const pool = new undici.Pool("https://www.deviantart.com", {
  connect: {
    // allowH2: true,
    maxVersion: "TLSv1.2",
  },
});

export function canHandle(url: URL): boolean {
  return (
    ((url.hostname === "deviantart.com" ||
      url.hostname.endsWith(".deviantart.com")) &&
      url.pathname.substring(1).includes("/")) ||
    url.hostname === "fav.me" ||
    url.hostname === "orig00.deviantart.net" ||
    url.hostname === "sta.sh"
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

  const { deviation } = await fetchDeviation(username, deviationId);

  return {
    source: "DeviantArt",
    url:
      deviation.url ??
      canonicalUrl?.href ??
      (await fetchCanonicalUrl(deviationId)).href,
    images: metadataOnly
      ? [
          {
            blob: new Blob([
              Buffer.alloc(deviation.extended.originalFile.filesize),
            ]),
            filename: undefined,
            type:
              deviation.extended.originalFile.type === "jpeg"
                ? "jpg"
                : deviation.extended.originalFile.type,
            width: deviation.extended.originalFile.width,
            height: deviation.extended.originalFile.height,
          },
        ]
      : url.hostname.endsWith(".deviantart.net")
        ? [
            await probeAndValidateImageUrl(
              url,
              deviation.extended.originalFile.type,
              deviation.extended.originalFile.width,
              deviation.extended.originalFile.height,
            ),
          ]
        : [await extractProbeResult(deviation)],
    artist: deviation.author.username,
    date: deviation.publishedTime.toJSDate(),
    title: deviation.title,
    description: extractDescription(deviation),
    tags: deviation.extended.tags,
  };
}

async function extractProbeResult(deviation: Deviation): Promise<ProbeResult> {
  const fullview =
    deviation.media.types.find((t) => t.t === "fullview_unpublished") ??
    deviation.media.types.find((t) => t.t === "fullview");

  if (!fullview) {
    const error: any = new Error("Could not find fullview media file");
    error.deviation = deviation;
    throw error;
  }

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

  const stashId = await submitStash(deviation.deviationId);
  const { deviation: stashDeviation } = await fetchDeviation("STASH", stashId);
  const result = await extractProbeResult(stashDeviation);

  result.filename = deviation.media.baseUri.split("/").pop();

  return validateProbeResult(
    result,
    deviation.extended.originalFile.type,
    deviation.extended.originalFile.width,
    deviation.extended.originalFile.height,
    deviation.extended.originalFile.filesize,
  );
}

async function fetchInternalAPI<T extends z.SomeZodObject>(
  path: string,
  params: Record<string, string>,
  body: T,
): Promise<z.infer<T>> {
  if (!COOKIE || !CSRF_TOKEN) {
    throw new Error("Missing DEVIANTART_COOKIE or DEVIANTART_CSRF_TOKEN env");
  }

  params.csrf_token = CSRF_TOKEN;

  const response = await pool.request({
    method: "GET",
    path,
    query: params,
    headers: {
      accept: "application/json",
      cookie: COOKIE,
      referer: "https://www.deviantart.com/",
      origin: "https://www.deviantart.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
  const json = await response.body.json();
  const data = z
    .union([
      z.object({
        status: z.literal("error"),
        error: z.string(),
        errorDescription: z.string(),
      }),
      body,
    ])
    .parse(json);

  if (data.status === "error") {
    throw new Error(`${data.error}: ${data.errorDescription}`);
  }

  return data;
}

async function fetchDeviation(username: string, deviationId: number) {
  if (username === "STASH") {
    const resp = await pool.request({
      method: "GET",
      path: `/stash/0${deviationId.toString(36)}`,
      headers: {
        accept: "text/html",
        referer: "https://www.deviantart.com/",
        origin: "https://www.deviantart.com",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    });
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
      (d) => d.deviationId === deviationId || d.stashPrivateid === deviationId,
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
      deviationid: deviationId.toString(),
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

  if (deviation.extended.descriptionText.html.type === "writer") {
    return (booru) =>
      convertHtmlToMarkdown(
        deviation.extended.descriptionText.html.markup,
        booru.markdown,
      );
  }

  return null;
}

const accessToken = lazyInit(async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Missing DEVIANTART_CLIENT_ID or DEVIANTART_CLIENT_SECRET env vars",
    );
  }

  const oauth = await fs.promises
    .readFile("oauth.json", "utf8")
    .then(JSON.parse)
    .catch(() => ({}));

  const oldRefreshToken = oauth.deviantart?.refreshToken;

  if (!oldRefreshToken) {
    throw new Error(
      "Missing DeviantArt OAuth refresh token. Do `npm run deviantart-oauth`",
    );
  }

  if (!oauth.deviantart.scope) {
    throw new Error(
      "Unusable DeviantArt OAuth refresh token. Please do `npm run deviantart-oauth`",
    );
  }

  const {
    access_token,
    expires_in,
    refresh_token: newRefreshToken,
  } = await fetchAPI(
    "/oauth2/token",
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: oldRefreshToken,
    },
    z.object({
      status: z.literal("success"),
      access_token: z.string(),
      expires_in: z.number().int().positive(),
      refresh_token: z.string(),
    }),
    false,
  );

  if (newRefreshToken !== oldRefreshToken) {
    oauth.deviantart.refreshToken = newRefreshToken;
    await fs.promises.writeFile("oauth.json", JSON.stringify(oauth), "utf8");
  }

  return {
    value: access_token,
    ttlSeconds: expires_in,
  };
});

function apiDownloadDeviation(deviationUuid: string) {
  return fetchAPI(
    `/api/v1/oauth2/deviation/download/${deviationUuid}`,
    { mature_content: "true" },
    z.object({
      src: z.string().url(),
      filename: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  );
}

async function submitStash(file: number) {
  async function fetchTokens() {
    const response = await pool.request({
      method: "GET",
      path: "/developers/console/stash/stash_submit/0f1832daa6b58a05841ec6058520c4f3",
      headers: {
        cookie: COOKIE,
        referer:
          "https://www.deviantart.com/developers/http/v1/20240701/stash_submit/0f1832daa6b58a05841ec6058520c4f3",
        origin: "https://www.deviantart.com",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    });
    const html = await response.body.text();
    const $ = cheerio.load(html);

    const validate_token = $("input[name=validate_token]").val();
    const validate_key = $("input[name=validate_key]").val();

    return {
      validate_token,
      validate_key,
    };
  }

  const tokens = await fetchTokens();

  const form = new undici.FormData();
  form.append("endpoint", "/stash/submit");
  const params = {
    ...tokens,
    mature_content: "true",
    file: file.toString(),
  };
  form.append(
    "params",
    JSON.stringify(
      Object.entries(params).map(([name, value]) => ({ name, value })),
    ),
  );
  const json = await (
    await pool.request({
      method: "POST",
      path: "https://www.deviantart.com/developers/console/do_api_request",
      headers: {
        cookie: COOKIE,
        referer:
          "https://www.deviantart.com/developers/console/stash/stash_submit/0f1832daa6b58a05841ec6058520c4f3",
        origin: "https://www.deviantart.com",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
      body: form,
      throwOnError: true,
    })
  ).body.json();
  const data = z
    .discriminatedUnion("status", [
      z.object({
        status: z.literal("error"),
        error: z.string(),
        error_description: z.string(),
        error_code: z.number(),
      }),
      z.object({
        status: z.literal("success"),
        itemid: z.number().int().positive(),
      }),
    ])
    .parse(json);

  if (data.status === "error") {
    throw new Error(
      `${data.error_code} ${data.error}: ${data.error_description}`,
    );
  }

  return data.itemid;
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

  const response = await pool.request({
    method: "GET",
    path: method,
    query: params,
    headers: {
      accept: "application/json",
    },
    throwOnError: true,
  });
  const json = await response.body.json();

  return body.parse(json);
}
