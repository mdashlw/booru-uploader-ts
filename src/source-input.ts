import inquirer from "inquirer";
import scrape from "./scraper.js";
import { SourceData } from "./scraper/types.js";

export interface MultipleSources {
  primary: SourceData;
  alternate: SourceData[];
}

export default async function inputSources(): Promise<MultipleSources> {
  const validateSourceUrlInput = (input: string): string | boolean => {
    try {
      new URL(input);
      return true;
    } catch (error: any) {
      return error.message;
    }
  };

  const { primarySourceUrlString } = await inquirer.prompt({
    type: "input",
    name: "primarySourceUrlString",
    message: "Primary Source",
    validate: (input: string) => validateSourceUrlInput(input),
  });
  const primarySourceUrl = new URL(primarySourceUrlString);

  const alternateSourceUrls: URL[] = [];

  while (true) {
    const { alternateSourceUrlString } = await inquirer.prompt({
      type: "input",
      name: "alternateSourceUrlString",
      message: "Alternate Source",
      validate: (input: string) => !input || validateSourceUrlInput(input),
    });

    if (!alternateSourceUrlString) {
      break;
    }

    const alternateSourceUrl = new URL(alternateSourceUrlString);

    alternateSourceUrls.push(alternateSourceUrl);
  }

  const [primarySource, alternateSources] = await Promise.all([
    scrape(primarySourceUrl),
    Promise.all(
      alternateSourceUrls.map((alternateSourceUrl) =>
        scrape(alternateSourceUrl),
      ),
    ),
  ]);

  return {
    primary: primarySource,
    alternate: alternateSources,
  };
}
