import * as cheerio from "cheerio";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import probeImageSize from "../utils/probe-image.js";

export function canHandle(url: URL): boolean {
  return (
    url.hostname.endsWith(".lofter.com") && url.pathname.startsWith("/post/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const response = await undici.request(url, { throwOnError: true });
  const body = await response.body.text();
  const $ = cheerio.load(body);

  return {
    source: "Lofter",
    url: `https://${url.hostname}${url.pathname}`,
    images: await Promise.all(
      Array.from(
        body.matchAll(
          /bigimgwidth="(?<width>\d+)" bigimgheight="(?<height>\d+)" bigimgsrc="(?<url>.+?)\?/g,
        ),
      ).map(async ({ groups }) => ({
        url: groups!.url,
        // use probeImageSize instead of fast probeImageType because
        // Lofter always sends "image/jpeg;charset=UTF-8" content type
        type: (await probeImageSize(groups!.url)).type,
        width: Number(groups!.width),
        height: Number(groups!.height),
      })),
    ),
    artist: /<a href="\/">(.+?)<\/a>\s*<\/h1>/.exec(body)![1],
    date: "",
    title: null,
    description: $(".content .text").text() || $(".ct .text").text() || null,
  };
}
