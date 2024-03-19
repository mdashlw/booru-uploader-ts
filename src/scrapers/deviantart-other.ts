import { Blob } from "node:buffer";
import process from "node:process";
import sharp from "sharp";
import undici from "undici";
import { IncomingHttpHeaders } from "undici/types/header.js";
import { z } from "zod";
import Booru from "../booru/index.js";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import { lazyInit } from "../utils/lazy-init.js";
import { ProbeResult, probeImageUrl } from "../utils/probe-image.js";
import { readableToBuffer } from "../utils/stream.js";

const CLIENT_ID = process.env.DEVIANTART_CLIENT_ID;
const CLIENT_SECRET = process.env.DEVIANTART_CLIENT_SECRET;
const HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  dnt: "1",
  pragma: "no-cache",
  "sec-ch-ua":
    '"Microsoft Edge";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-ch-viewport-height": "1075",
  "sec-ch-viewport-width": "1912",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.60",
};

const User = z.object({
  userId: z.number().int().positive(),
  username: z.string(),
});
type User = z.infer<typeof User>;

const Deviation = z.object({
  deviationId: z.number().int().positive(),
  url: z.string().url(),
  title: z.string().trim(),
  publishedTime: z.coerce.date(),
  isDownloadable: z.boolean(),
  author: z.number().int().positive(),
  media: z.object({
    baseUri: z.string().url(),
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
});
type Deviation = z.infer<typeof Deviation>;

const DeviationExtended = z.object({
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
});
type DeviationExtended = z.infer<typeof DeviationExtended>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname.endsWith(".deviantart.com") &&
    url.pathname.substring(1).includes("/") &&
    !url.pathname.startsWith("/stash/")
  );
}

export async function scrape(
  url: URL,
  metadataOnly?: boolean,
): Promise<SourceData> {
  const initialState = await extractInitialState(url).catch((error) => {
    throw new Error(`Failed to extract initial state for ${url}`, {
      cause: error,
    });
  });
  const deviationId: number =
    initialState["@@DUPERBROWSE"].rootStream.currentOpenItem;
  const deviation = Deviation.parse(
    initialState["@@entities"].deviation[deviationId],
  );
  const deviationExtended = DeviationExtended.parse(
    initialState["@@entities"].deviationExtended[deviationId],
  );
  const author = User.parse(initialState["@@entities"].user[deviation.author]);

  let imageUrl: URL | undefined,
    type: string,
    width: number,
    height: number,
    probeResult: ProbeResult | undefined;

  const fullview = deviation.media.types.find((t) => t.t === "fullview");

  if (!fullview) {
    const error: any = new Error("Fullview media type not found");
    error.deviation = deviation;
    throw error;
  }

  imageUrl = new URL(deviation.media.baseUri);
  imageUrl.pathname = fullview.c
    ? `${imageUrl.pathname}/v1/fill/w_${fullview.w},h_${fullview.h}/fullview.png`
    : imageUrl.pathname;
  if (fullview.r !== -1) {
    imageUrl.searchParams.set("token", deviation.media.token![fullview.r]);
  }

  type = deviationExtended.originalFile.type;
  width = fullview.w;
  height = fullview.h;

  if (
    fullview.w !== deviationExtended.originalFile.width ||
    fullview.h !== deviationExtended.originalFile.height
  ) {
    const { cardImage } = await extractInitialState(
      "https://www.deviantart.com/users/login",
      {
        referer: url.toString(),
      },
    );
    const cardImageUrl = new URL(cardImage);

    if (
      cardImageUrl.searchParams.has("token") &&
      cardImageUrl.searchParams.get("token") !==
        imageUrl.searchParams.get("token")
    ) {
      console.log(
        `Deviation ${deviation.deviationId} card image has different token downloadable=${deviation.isDownloadable}`,
        JSON.parse(
          Buffer.from(
            cardImageUrl.searchParams.get("token")!.split(".")[1],
            "base64",
          ).toString("utf8"),
        ),
      );
      imageUrl = cardImageUrl;
      ({ type, width, height } = deviationExtended.originalFile);
      probeResult = await probeImageUrl(imageUrl);
    } else if (deviation.isDownloadable) {
      console.log(`Deviation ${deviation.deviationId} is downloadable`);
      const download = await apiDownloadDeviation(
        deviationExtended.deviationUuid,
      );

      if (
        download.width !== deviationExtended.originalFile.width ||
        download.height !== deviationExtended.originalFile.height
      ) {
        throw new Error(
          `Downloaded image has different dimensions than original`,
        );
      }

      imageUrl = new URL(download.src);
      ({ type, width, height } = deviationExtended.originalFile);
      probeResult = await probeImageUrl(imageUrl, HEADERS);
    } else if (deviationId <= 790_677_560) {
      console.log(
        `Deviation ${deviation.deviationId} is old enough for intermediary`,
      );
      // https://github.com/danbooru/danbooru/blob/ddd2d2335fb09b30f2b5b06fbd4e7aa5c37b5b6a/app/logical/source/extractor/deviant_art.rb#L49
      imageUrl = new URL(deviation.media.baseUri);
      imageUrl.pathname = `/intermediary${imageUrl.pathname}`;
      probeResult = await probeImageUrl(imageUrl);
    }
  } else {
    console.log(
      `Deviation ${deviation.deviationId} fullview matches original dimensions`,
    );
    probeResult = await probeImageUrl(imageUrl);
  }

  const isOriginalDimensions =
    width === deviationExtended.originalFile.width &&
    height === deviationExtended.originalFile.height;

  if (!isOriginalDimensions && !metadataOnly) {
    console.log("Not original dimensions");

    if (fullview.c && fullview.r !== -1) {
      console.log(
        "Combining chunks",
        JSON.stringify({ originalFile: deviationExtended.originalFile }),
      );

      const { width: imageWidth, height: imageHeight } =
        deviationExtended.originalFile;
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
          const chunkUrl = `${
            deviation.media.baseUri
          }/v1/crop/w_${chunkWidthActual},h_${chunkHeightActual},x_${x},y_${y}/image.png?token=${
            deviation.media.token![fullview.r]
          }`;

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
                  throw new Error(
                    `Chunk [${x}, ${y}] (${chunkWidthActual}x${chunkHeightActual}) is bad`,
                  );
                }

                return chunk;
              }),
          );
        }
      }

      image.composite(await Promise.all(chunkPromises));

      const buffer = await image.png().toBuffer();
      const blob = new Blob([buffer]);

      ({ type, width, height } = deviationExtended.originalFile);
      probeResult = {
        blob,
        filename: "chunked.png",
        type,
        width,
        height,
      };

      if (type === "jpeg" || type === "jpg") {
        console.log(
          "Warning: original file is jpg but resulting file will be png",
        );
      }
    }
  }

  if (type === "jpeg") {
    type = "jpg";
  }

  if (!probeResult) {
    probeResult = await probeImageUrl(imageUrl);
  }

  // if (probeResult.type !== type) {
  //   throw new Error(
  //     `Probe type ${probeResult.type} does not match original type ${type}`,
  //   );
  // }

  // if (probeResult.width !== width || probeResult.height !== height) {
  //   throw new Error(
  //     `Probe dimensions ${probeResult.width}x${probeResult.height} do not match original dimensions ${width}x${height}`,
  //   );
  // }

  return {
    source: "DeviantArt",
    url: deviation.url,
    images: [probeResult],
    artist: author.username,
    date: formatDate(deviation.publishedTime),
    title: deviation.title,
    description: extractDescription(deviationExtended),
  };
}

async function extractInitialState(
  url: string | URL,
  headers?: IncomingHttpHeaders,
): Promise<any> {
  const response = await undici
    .request(url, {
      headers: {
        ...HEADERS,
        ...headers,
      },
      maxRedirections: 2,
      throwOnError: true,
    })
    .catch((error) => {
      throw new Error(`Failed to fetch ${url}`, { cause: error });
    });
  const body = await response.body.text().catch((error) => {
    throw new Error(`Failed to read response body for ${url}`, {
      cause: error,
    });
  });
  const match = /window\.__INITIAL_STATE__ = (.+);/.exec(body);

  if (!match) {
    throw new Error("Could not find initial state");
  }

  return eval(match[1]);
}

function extractDescription(
  deviationExtended: DeviationExtended,
): string | null | ((booru: Booru) => string) {
  function appendTags(dest: string) {
    if (deviationExtended.tags) {
      if (dest) {
        dest += "\n\n";
      }

      dest += deviationExtended.tags.map((tag) => `#${tag.name}`).join(" ");
    }

    return dest;
  }

  if (deviationExtended.descriptionText.excerpt) {
    return appendTags(deviationExtended.descriptionText.excerpt);
  }

  if (deviationExtended.descriptionText.html.type !== "draft") {
    return (booru) =>
      appendTags(
        convertHtmlToMarkdown(
          deviationExtended.descriptionText.html.markup,
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
