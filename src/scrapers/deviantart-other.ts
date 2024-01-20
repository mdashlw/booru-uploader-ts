import { Blob } from "node:buffer";
import process from "node:process";
import sharp from "sharp";
import undici from "undici";
import { IncomingHttpHeaders } from "undici/types/header.js";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import { ProbeResult, probeImageUrl } from "../utils/probe-image.js";
import { readableToBuffer } from "../utils/stream.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";
import Booru from "../booru/index.js";

const HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  cookie: process.env.DEVIANTART_COOKIE!,
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
  originalFile: z.object({
    type: z.string(),
    width: z.number().int(),
    height: z.number().int(),
  }),
  download: z
    .object({
      url: z.string().url(),
      type: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    })
    .optional(),
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
    url.pathname.substring(1).includes("/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
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
        cookie: "",
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

      if (!deviationExtended.download) {
        throw new Error("Deviation is downloadable but no download object");
      }

      imageUrl = new URL(deviationExtended.download.url);
      ({ type, width, height } = deviationExtended.download);
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

  if (!isOriginalDimensions) {
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

  if (probeResult.type !== type) {
    throw new Error(
      `Probe type ${probeResult.type} does not match original type ${type}`,
    );
  }

  if (probeResult.width !== width || probeResult.height !== height) {
    throw new Error(
      `Probe dimensions ${probeResult.width}x${probeResult.height} do not match original dimensions ${width}x${height}`,
    );
  }

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
    .then((response) => {
      const setCookieHeader = response.headers["set-cookie"];

      if (headers?.cookie === undefined && setCookieHeader) {
        const setCookies = Array.isArray(setCookieHeader)
          ? setCookieHeader
          : [setCookieHeader];
        const cookies = setCookies.flatMap((c) => c.split("; ")[0]);

        HEADERS.cookie = Object.entries({
          ...Object.fromEntries(
            HEADERS.cookie.split("; ").map((kv) => kv.split("=")),
          ),
          ...Object.fromEntries(cookies.map((kv) => kv.split("="))),
        })
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      }

      return response;
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
