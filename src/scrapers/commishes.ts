import * as cheerio from "cheerio";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import probeImageType from "../utils/probe-image-type.js";

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "portfolio.commishes.com" &&
    url.pathname.startsWith("/upload/show/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const body = await undici
    .request(url, { throwOnError: true })
    .then((response) => response.body.text());

  const userMatch = /<a href="\/user\/(.+?)\/">\1<\/a>/.exec(body);
  if (!userMatch) {
    throw new Error("Could not find user");
  }
  const [, user] = userMatch;

  const uploadPathnameMatch =
    /history\.replaceState\({}, window\.title, '(.+)'\);/.exec(body);
  if (!uploadPathnameMatch) {
    throw new Error("Could not find conventional upload pathname");
  }
  const uploadUrl = new URL(url.href);
  [, uploadUrl.pathname] = uploadPathnameMatch;

  const dateMatch = /&copy; (\d+) - (\w+), (\d+)		<\/div>/.exec(body);
  if (!dateMatch) {
    throw new Error("Could not find date");
  }
  const [, year, monthShort] = dateMatch;
  const month =
    {
      Jan: "January",
      Feb: "February",
      Mar: "March",
      Apr: "April",
      May: "May",
      Jun: "June",
      Jul: "July",
      Aug: "August",
      Sep: "September",
      Oct: "October",
      Nov: "November",
      Dec: "December",
    }[monthShort] ?? monthShort;
  const day = Number(dateMatch[3]);

  const uploadIdMatch = /'\/upload\/tag\/(\d+)\/'/.exec(body);
  if (!uploadIdMatch) {
    throw new Error("Could not find upload id");
  }
  const [, uploadId] = uploadIdMatch;

  const originalImageUrl = `https://portfolio.commishes.com/image/${uploadId}/original`;
  const directImageUrl = await undici
    .request(originalImageUrl, {
      method: "HEAD",
      throwOnError: true,
      maxRedirections: 0,
    })
    .then((response) => {
      if (response.statusCode === 302) {
        return response.headers["location"] as string;
      } else {
        return originalImageUrl;
      }
    });

  const widthMatch = /var imgWidth {2}= (\d+);/.exec(body);
  const heightMatch = /var imgHeight = (\d+);/.exec(body);
  if (!widthMatch || !heightMatch) {
    throw new Error("Could not find image dimensions");
  }
  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);

  const $ = cheerio.load(body);

  let title: string | null = $("#upload-title").text().trim();
  if (title === "No title") {
    title = null;
  }

  const description = $("#upload-description").text().trim() || null;

  return {
    source: "Commishes",
    url: uploadUrl.toString(),
    images: [
      {
        url: directImageUrl,
        type: await probeImageType(directImageUrl),
        width,
        height,
      },
    ],
    artist: user,
    date: `${month} ${day}, ${year}`,
    title,
    description,
  };
}
