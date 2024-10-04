import Booru from "./booru/index.ts";
import type { SourceData } from "./scraper/types.ts";
import { type MultipleSources } from "./source-input.ts";

function formatSource(booru: Booru, source: SourceData, isAlternate = false) {
  let result =
    (booru.supportsMultipleSources
      ? source.source
      : booru.markdown.inlineLink(source.source, source.url)) +
    (source.date ? ` (${source.date})` : "");

  const formattedTitle = source.title
    ? booru.markdown.bold(booru.markdown.escape(source.title))
    : "";
  const formattedDescription = source.description
    ? typeof source.description === "string"
      ? booru.markdown.escape(source.description)
      : source.description(booru)
    : "";
  const formattedTags =
    source.tags
      ?.map((tag) => booru.markdown.inlineLink(`#${tag.name}`, tag.url))
      .join(" ") ?? "";

  if (formattedTitle || formattedDescription || formattedTags) {
    result +=
      "\n" +
      booru.markdown.blockQuote(
        `${formattedTitle}\n${formattedDescription}\n\n${formattedTags}`.trim(),
      );
  }

  return result;
}

export default function makeDescription(
  booru: Booru,
  sources: MultipleSources,
) {
  let result = formatSource(booru, sources.primary);

  for (const alternateSource of sources.alternate) {
    result += "\n\n" + formatSource(booru, alternateSource, true);
  }

  return result;
}
