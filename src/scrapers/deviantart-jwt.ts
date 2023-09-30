import * as cheerio from "cheerio";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

interface User {
  username: string;
}

interface Deviation {
  url: string;
  title: string;
  publishedTime: string;
  author: number;
  media: {
    baseUri: string;
  };
}

interface DeviationExtended {
  originalFile: {
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

  let title: string | null = deviation.title;
  if (title === "Untitled") {
    title = null;
  }

  return {
    source: "DeviantArt",
    url: deviation.url,
    images: [
      {
        url: extractMediaUrl(deviation).toString(),
        width: deviationExtended.originalFile.width,
        height: deviationExtended.originalFile.height,
      },
    ],
    artist: author.username,
    date: formatDate(new Date(deviation.publishedTime)),
    title,
    description: extractDescription(deviationExtended),
  };
}

async function extractInitialState(url: URL): Promise<any> {
  const response = await undici
    .request(url, {
      headers: {
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        dnt: "1",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
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

function extractMediaUrl(deviation: Deviation): URL {
  const url = new URL(deviation.media.baseUri);

  const header = {
    typ: "JWT",
    alg: "none",
  };
  const payload = {
    sub: "urn:app:",
    iss: "urn:app:",
    obj: [[{ path: url.pathname }]],
    aud: ["urn:service:file.download"],
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  const token = `${encodedHeader}.${encodedPayload}.`;

  url.searchParams.set("token", token);

  url.hostname = url.hostname.replace("images-wixmp", "wixmp");

  return url;
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
