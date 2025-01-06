import { input, select } from "@inquirer/prompts";
import scrape from "./scraper.ts";
import type { SourceData } from "./scraper/types.ts";
import { boorus } from "./boorus.ts";
import process from "node:process";
import printSourceImages from "./print-source-images.ts";

export interface MultipleSources {
  primary: SourceData;
  alternate: SourceData[];
}

export default async function inputSources({
  withPrimary,
  metadataOnly,
}: {
  withPrimary: true;
  metadataOnly: boolean;
}): Promise<MultipleSources>;
export default async function inputSources({
  withPrimary,
  metadataOnly,
}: {
  withPrimary: false;
  metadataOnly: boolean;
}): Promise<SourceData[]>;
export default async function inputSources({
  withPrimary,
  metadataOnly,
}: {
  withPrimary: boolean;
  metadataOnly: boolean;
}): Promise<SourceData[] | MultipleSources> {
  const booruImageId = Number(process.argv[2]);

  if (!Number.isNaN(booruImageId)) {
    const booru = boorus[0];
    const booruImage = await booru.fetchImage(booruImageId);

    if (!booruImage) {
      throw new Error(`Booru image not found: ${booruImageId}`);
    }

    const sourceUrls = booruImage.source_urls?.map((url) => new URL(url)) ?? [];

    if (sourceUrls.length === 0) {
      throw new Error(`Booru image has no source urls: ${booruImageId}`);
    }

    const sources = await Promise.all(
      sourceUrls.map((url) => scrape(url, metadataOnly)),
    );

    if (withPrimary) {
      if (sources.length === 1) {
        return {
          primary: sources[0],
          alternate: [],
        };
      }

      await printSourceImages(sources);

      const primary = await select({
        message: "Primary Source",
        choices: sources.map((source, index) => ({
          value: source,
          name: `#${index + 1} - ${source.source ?? source.url}`,
        })),
      });

      return {
        primary,
        alternate: sources.filter((source) => source !== primary),
      };
    }

    return sources;
  }

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

  if (withPrimary) {
    return {
      primary: primarySource,
      alternate: alternateSources,
    };
  } else {
    return [primarySource, ...alternateSources];
  }
}
