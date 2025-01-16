import Booru from "./booru/index.ts";
import type { SourceData } from "./scraper/types.ts";

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
}

function formatSource(booru: Booru, source: SourceData) {
  if (!source.source) {
    return "";
  }

  const image = source.images.find((i) => i.selected);

  let result =
    (booru.supportsMultipleSources
      ? source.source
      : booru.markdown.inlineLink(source.source, source.url)) +
    (source.date ? ` (${formatDate(source.date)})` : "");

  const mainTitle = source.title ? booru.markdown.bold(source.title) : "";
  const imageTitle = image?.title ? booru.markdown.bold(image.title) : "";

  const mainDescription = source.description
    ? typeof source.description === "string"
      ? booru.markdown.escape(source.description)
      : source.description(booru)
    : "";
  const imageDescription = image?.description
    ? booru.markdown.escape(image.description)
    : "";

  const formattedTags =
    source.tags
      ?.map((tag) => booru.markdown.inlineLink(`#${tag.name}`, tag.url))
      .join(" ") ?? "";

  if (mainTitle || mainDescription || formattedTags) {
    result +=
      "\n" +
      booru.markdown.blockQuote(
        `${mainTitle}\n${mainDescription}\n\n${formattedTags}`.trim(),
      );

    if (imageTitle || imageDescription) {
      result += "\n";
    }
  }

  if (imageTitle || imageDescription) {
    result +=
      "\n" +
      booru.markdown.blockQuote(`${imageTitle}\n${imageDescription}`.trim());
  }

  return result;
}

export default function makeDescription(booru: Booru, sources: SourceData[]) {
  return sources
    .sort(
      (a, b) =>
        (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity),
    )
    .map((source) => formatSource(booru, source))
    .join("\n\n")
    .trim();
}
