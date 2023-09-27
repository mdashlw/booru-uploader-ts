import Booru from "./booru/index.js";
import { SourceData } from "./scraper/types.js";
import { MultipleSources } from "./source-input.js";

function formatSource(booru: Booru, source: SourceData, isAlternate = false) {
  let result = isAlternate
    ? !booru.supportsMultipleSources
      ? booru.markdown.inlineLink(
          `Alternate Source (${source.source})`,
          source.url,
        )
      : ""
    : source.date;

  const formattedTitle =
    source.title && booru.markdown.bold(booru.markdown.escape(source.title));
  const formattedDescription =
    source.description && booru.markdown.escape(source.description);

  if (formattedTitle || formattedDescription) {
    result +=
      "\n" +
      booru.markdown.blockQuote(
        formattedTitle
          ? formattedDescription
            ? formattedTitle + "\n" + formattedDescription
            : formattedTitle
          : formattedDescription ?? "",
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
