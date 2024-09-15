import * as cheerio from "cheerio";
import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";

const COOKIE = process.env.NEWGROUNDS_COOKIE;

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "www.newgrounds.com" || url.hostname === "newgrounds.com"
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  if (COOKIE === undefined) {
    throw new Error("Missing Newgrounds cookie");
  }

  const response = await undici.request(url, {
    headers: {
      cookie: COOKIE,
    },
    maxRedirections: 1,
    throwOnError: true,
  });
  const body = await response.body.text();
  const $ = cheerio.load(body);

  const pod = $(".pod");
  const { full_image_text } = eval(/PHP\.merge(\(.+?\));/.exec(body)![1]);
  const [, imageUrl, _width, _height] =
    /^<img src="(.+?)" alt=".+?" width="(\d+)" height="(\d+)">$/.exec(
      full_image_text,
    )!;
  const width = Number(_width);
  const height = Number(_height);

  return {
    source: "Newgrounds",
    url: pod.find("meta[itemprop=url]").attr("content")!,
    images: [
      await probeAndValidateImageUrl(imageUrl, undefined, width, height),
    ],
    artist: $(".item-details-main a").text().trim(),
    date: formatDate(
      new Date(pod.find("meta[itemprop=datePublished]").attr("content")!),
    ),
    title: pod.find("[itemprop=name]").text().trim(),
    description: (booru) => {
      let description = convertHtmlToMarkdown(
        pod.find("#author_comments").html()!,
        booru.markdown,
      );

      const tags = pod
        .find(".tags a")
        .map((_, el) => $(el).text())
        .toArray();

      if (tags.length) {
        if (description) {
          description += "\n\n";
        }

        description += tags.map((tag) => `#${tag}`).join(" ");
      }

      return description;
    },
  };
}
