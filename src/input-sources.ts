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

    if (booruImage.hidden_from_users) {
      throw new Error(`Booru image is hidden: ${booruImageId}`);
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

      const sourcesWithImages = sources.filter(
        (source) => source.images.length,
      );

      if (!sourcesWithImages.length) {
        throw new Error("No sources with images");
      }

      if (sourcesWithImages.length === 1) {
        const primary = sourcesWithImages[0];
        return {
          primary,
          alternate: sources.filter((source) => source !== primary),
        };
      }

      await printSourceImages(sources);

      const primary = await select({
        message: "Primary Source",
        choices: sourcesWithImages.map((source, index) => ({
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

  if (withPrimary) {
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

    if (!primarySource.images.length) {
      throw new Error("Primary source has no images");
    }

    return {
      primary: primarySource,
      alternate: alternateSources,
    };
  } else {
    const sourceUrls: URL[] = [];

    while (true) {
      const sourceUrlString = await input({
        message: "Source",
        validate: (value) => !value || URL.canParse(value),
      });

      if (!sourceUrlString) {
        break;
      }

      const sourceUrl = new URL(sourceUrlString);

      sourceUrls.push(sourceUrl);
    }

    const sources = await Promise.all(
      sourceUrls.map((sourceUrl) => scrape(sourceUrl, metadataOnly)),
    );

    return sources;
  }
}
