import * as cheerio from "cheerio";
import process from "node:process";
import undici from "undici";
import type { IncomingHttpHeaders } from "undici/types/header.js";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import fastProbe from "../utils/probe-image-size.js";

const COOKIE = process.env.DEVIANTART_COOKIE;
const HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  cookie: COOKIE,
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

interface User {
  username: string;
}

interface Deviation {
  deviationId: number;
  url: string;
  title: string;
  publishedTime: string;
  isDownloadable: boolean;
  author: number;
  media: {
    baseUri: string;
    token: string[];
    types: {
      t: string;
      r: number;
      h: number;
      w: number;
    }[];
  };
}

interface DeviationExtended {
  originalFile: {
    width: number;
    height: number;
  };
  download?: {
    url: string;
    width: number;
    height: number;
  };
  descriptionText: {
    excerpt: string;
    html: {
      markup: string;
    };
  };
}

export function canHandle(url: URL): boolean {
  return url.hostname.endsWith(".deviantart.com");
}

export async function scrape(url: URL): Promise<SourceData> {
  const initialState = await extractInitialState(url).catch((error) => {
    throw new Error(`Failed to extract initial state for ${url}`, {
      cause: error,
    });
  });
  const deviationId: number =
    initialState["@@DUPERBROWSE"].rootStream.currentOpenItem;
  const deviation: Deviation =
    initialState["@@entities"].deviation[deviationId];
  const deviationExtended: DeviationExtended =
    initialState["@@entities"].deviationExtended[deviationId];
  const author: User = initialState["@@entities"].user[deviation.author];

  let imageUrl: URL, width: number, height: number;

  const fullview = deviation.media.types.find((t) => t.t === "fullview");

  if (!fullview) {
    const error: any = new Error("Fullview media type not found");
    error.deviation = deviation;
    throw error;
  }

  imageUrl = new URL(deviation.media.baseUri);
  imageUrl.pathname = `${imageUrl.pathname}/v1/fill/w_${fullview.w},h_${fullview.h}/fullview.png`;
  imageUrl.searchParams.set("token", deviation.media.token[fullview.r]);
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
      ({ width, height } = deviationExtended.originalFile);
    } else if (deviation.isDownloadable) {
      console.log(`Deviation ${deviation.deviationId} is downloadable`);

      if (!deviationExtended.download) {
        throw new Error("Deviation is downloadable but no download object");
      }

      console.log(deviationExtended.download.url);
      imageUrl = new URL(
        await undici
          .request(deviationExtended.download.url, {
            headers: HEADERS,
            throwOnError: true,
          })
          .then((response) => response.headers["location"] as string),
      );
      ({ width, height } = deviationExtended.download);
    } else if (deviationId <= 790_677_560) {
      console.log(
        `Deviation ${deviation.deviationId} is old enough for intermediary`,
      );
      // https://github.com/danbooru/danbooru/blob/ddd2d2335fb09b30f2b5b06fbd4e7aa5c37b5b6a/app/logical/source/extractor/deviant_art.rb#L49
      imageUrl = new URL(deviation.media.baseUri);
      imageUrl.pathname = `/intermediary${imageUrl.pathname}`;
      ({ width, height } = await fastProbe(imageUrl));
    }
  } else {
    console.log(
      `Deviation ${deviation.deviationId} fullview matches original dimensions`,
    );
  }

  return {
    source: "DeviantArt",
    url: deviation.url,
    images: [
      {
        url: imageUrl.toString(),
        width,
        height,
      },
    ],
    artist: author.username,
    date: formatDate(new Date(deviation.publishedTime)),
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
): string | null {
  return (
    deviationExtended.descriptionText.excerpt ||
    cheerio
      .load(
        deviationExtended.descriptionText.html.markup
          .replace(
            '<br/><br/><p><a class="external" href="https://www.deviantart.com/users/outgoing?http://www.postybirb.com">Posted using PostyBirb</a></p>',
            "",
          )
          .replaceAll(
            /<a target="_self" href="(.+?)" ><img class="avatar" width="50" height="50" src=".+?" alt=".+?" title=".+?" \/><\/a>/g,
            "$1",
          )
          .replaceAll(
            /<span class="shadow-holder" data-embed-type="deviation" data-embed-id="950347966" data-embed-format="thumb"><span class="shadow mild" ><a class="thumb" href="(.+?)" title=".+?"data-super-img=".+?" data-super-width=".+?" data-super-height=".+?" data-super-transparent=".+?" data-super-alt=".+?" data-super-full-img=".+?" data-super-full-width=".+?" data-super-full-height=".+?" {8}data-sigil="thumb">\n {8}<i><\/i><img {4}width=".+?" height=".+?" alt=".+?" src=".+?" data-src=".+?" srcset=".+?" sizes=".+?"><\/a><\/span><!-- \^TTT --><!-- TTT\$ --><\/span>/g,
            "$1",
          )
          .replaceAll("<br />", "\n")
          .replaceAll(
            /<a class="external" href="https:\/\/www\.deviantart\.com\/users\/outgoing\?(.+?)">.+?<\/a>/g,
            "$1",
          ),
      )
      .text()
      .trim() ||
    null
  );
}
