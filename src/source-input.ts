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
  const validateSourceUrlInput = (value: string): string | boolean => {
    try {
      new URL(value);
      return true;
    } catch (error: any) {
      return error.message;
    }
  };

  const primarySourceUrlString = await input({
    message: "Primary Source",
    validate: (value: string) => validateSourceUrlInput(value),
  });
  const primarySourceUrl = new URL(primarySourceUrlString);

  const alternateSourceUrls: URL[] = [];

  while (true) {
    const alternateSourceUrlString = await input({
      message: "Alternate Source",
      validate: (value: string) => !value || validateSourceUrlInput(value),
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
        scrape(alternateSourceUrl, metadataOnly),
      ),
    ),
  ]);

  return {
    primary: primarySource,
    alternate: alternateSources,
  };
}
