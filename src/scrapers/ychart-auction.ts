import * as cheerio from "cheerio";
import undici from "undici";
import type { SourceData } from "../scraper/types.ts";
import { probeImageUrl } from "../utils/probe-image.ts";
import { manipulateImageUrl } from "./ychart-cdn.ts";

export function canHandle(url: URL): boolean {
  return url.hostname === "ych.art" && url.pathname.startsWith("/auction/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const $ = await undici
    .request(url, {
      maxRedirections: 1,
      throwOnError: true,
    })
    .then((response) => response.body.text())
    .then((html) => cheerio.load(html));
  const data = JSON.parse(
    $("script[type='application/ld+json']").first().text().trim(),
  );
  const completedImageUrl = new URL($("#auction-result").attr("src")!);

  if ($("#auction-artist strong").text().trim() !== "Completed") {
    throw new Error("Not completed auctions are not supported");
  }

  manipulateImageUrl(completedImageUrl);

  return {
    source: data.brand.name,
    url: data.offers.url,
    images: [await probeImageUrl(completedImageUrl)],
    artist: data.offers.seller.name,
    date: $("#auction-artist strong").attr("title")!.trim(),
    title: data.name,
    description: null,
  };
}
