import { input } from "@inquirer/prompts";
import scrape from "./scraper.js";
import { SourceData } from "./scraper/types.js";

export interface MultipleSources {
  primary: SourceData;
  alternate: SourceData[];
}

export default async function inputSources(
  metadataOnly?: boolean,
): Promise<MultipleSources> {
  const primarySourceUrlString = await input({
    message: "Primary Source",
    validate: (value) => URL.canParse(value),
  });
  const primarySourceUrl = new URL(primarySourceUrlString);

  const alternateSourceUrls: URL[] = [];

  while (true) {
    const alternateSourceUrlString = await input({
      message: "Alternate Source",
      validate: (value) => !value || URL.canParse(value),
    });

    if (!alternateSourceUrlString) {
      break;
    }

    const alternateSourceUrl = new URL(alternateSourceUrlString);

    alternateSourceUrls.push(alternateSourceUrl);
  }

  const [primarySource, alternateSources] = await Promise.all([
    scrape(primarySourceUrl, metadataOnly),
    Promise.all(
      alternateSourceUrls.map((alternateSourceUrl) =>
        scrape(alternateSourceUrl, true),
      ),
    ),
  ]);

  return {
    primary: primarySource,
    alternate: alternateSources,
  };
}
