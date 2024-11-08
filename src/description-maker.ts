import Booru from "./booru/index.ts";
import type { SourceData } from "./scraper/types.ts";
import { type MultipleSources } from "./source-input.ts";

function formatSource(booru: Booru, source: SourceData) {
  if (!source.source) {
    return "";
  }

  const image = source.images.find((i) => i.selected);

  let result =
    (booru.supportsMultipleSources
      ? source.source
      : booru.markdown.inlineLink(source.source, source.url)) +
    (source.date ? ` (${source.date})` : "");

  let title = "";

  if (source.title) {
    if (image?.title) {
      title = `${source.title} - ${image.title}`;
    } else {
      title = source.title;
    }
  } else if (image?.title) {
    title = image.title;
  }

  const formattedTitle = title ? booru.markdown.bold(title) : "";

  let description = "";

  if (source.description) {
    const sourceDescription =
      typeof source.description === "string"
        ? booru.markdown.escape(source.description)
        : source.description(booru);

    if (image?.description) {
      description = `${sourceDescription}\n\n${booru.markdown.escape(image.description)}`;
    } else {
      description = sourceDescription;
    }
  } else if (image?.description) {
    description = booru.markdown.escape(image.description);
  }

  const formattedDescription = description;
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
    result += "\n\n" + formatSource(booru, alternateSource);
  }

  return result.trim();
}
