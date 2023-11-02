import * as cheerio from "cheerio";
import undici from "undici";
import { SourceData } from "../scraper/types.js";

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
    images: Array.from(
      body.matchAll(
        /bigimgwidth="(?<width>\d+)" bigimgheight="(?<height>\d+)" bigimgsrc="(?<url>.+?)\?/g,
      ),
    ).map(({ groups }) => ({
      url: groups!.url,
      type: undefined,
      width: Number(groups!.width),
      height: Number(groups!.height),
    })),
    artist: /<h1><a href="\/">(.+?)<\/a><\/h1>/.exec(body)![1],
    date: "",
    title: "",
    description: $(".content .text").text(),
  };
}
