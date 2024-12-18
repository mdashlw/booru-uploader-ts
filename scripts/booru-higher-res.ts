import chalk from "chalk";
import chalkTemplate from "chalk-template";
import crypto from "node:crypto";
import process from "node:process";
import readline from "node:readline/promises";
import util from "node:util";
import type { Image, TagName } from "../src/booru/types.ts";
import { boorus } from "../src/boorus.ts";
import { ratingTags } from "../src/rating-tags.ts";
import { findScraper } from "../src/scraper.ts";
import type { SourceData, SourceImageData } from "../src/scraper/types.ts";

util.inspect.defaultOptions.depth = Infinity;

function numbersEqualWithinMargin(
  a: number,
  b: number,
  marginPercentage: number,
) {
  return Math.abs(a - b) <= Math.max(a, b) * (marginPercentage / 100);
}

const { values: args } = util.parseArgs({
  options: {
    booru: { type: "string" },
    query: { type: "string" },
    sort: { type: "string" },
    hashCheck: { type: "boolean" },
  },
});

if (!args.booru || !args.query) {
  console.error(
    "Usage: --booru <booru name> --query <search query> [--sort <field|field:direction>]",
  );
  process.exit(1);
}

const _booru = boorus.find(
  (b) => b.name.toLowerCase() === args.booru!.toLowerCase(),
);

if (!_booru) {
  console.error(`Unknown booru: ${args.booru}`);
  process.exit(1);
}

const booru = _booru;
const { perPage, filterId } = {
  perPage: 50,
  ...{
    Derpibooru: {
      // filterId: 56027,
      filterId: 220276,
    },
    Manebooru: {
      filterId: 2,
    },
  }[booru.name]!,
};

async function* images(query: string, sort?: string[] | string) {
  for (let page = 1; ; page++) {
    const { images } = await booru.fetch<{ images: Image[] }>({
      method: "GET",
      path: "/api/v1/json/search/images",
      query: {
        filter_id: filterId,
        page,
        per_page: perPage,
        q: query,
        sf: sort ? (Array.isArray(sort) ? sort[0] : sort) : undefined,
        sd: sort && Array.isArray(sort) ? sort[1] : undefined,
      },
    });

    if (!images.length) {
      break;
    }

    yield* images;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

for await (const image of images(
  args.query,
  args.sort === "random" ? `random:${Date.now()}` : args.sort?.split(":"),
)) {
  const imageUrl = `${booru.baseUrl}images/${image.id}`;
  let ok = true;

  const imageRatingTags = ratingTags.filter((tag) =>
    image.tags.includes(tag as TagName),
  );

  const artistTags = await Promise.all(
    image.tags
      .filter((name) => name.startsWith("artist:"))
      .map(async (name) => {
        const tag = await booru.fetchTagByName(name);

        if (!tag) {
          return name;
        }

        if (tag.dnp_entries.length) {
          return `${tag.name} - ${tag.dnp_entries
            .map((e) => e.dnp_type)
            .join(" + ")}`;
        }

        return tag.name;
      }),
  );

  const contextTags = [
    ...imageRatingTags,
    ...artistTags,
    `uploader:${image.uploader}`,
  ];

  const sourceUrls =
    image.source_urls ?? (image.source_url ? [image.source_url] : []);

  // for (const [, link] of image.description.matchAll(
  //   /(?<!!)\[(?:.+?)\]\((https?:\/\/[^\s]+)\)/g,
  // )) {
  //   console.log(`Matched ${link} in description of #${image.id}`);
  //   if (!sourceUrls.includes(link)) {
  //     sourceUrls.push(link);
  //   }
  // }

  for (const sourceUrlString of sourceUrls) {
    const sourceUrl = new URL(sourceUrlString);
    const scraper = findScraper(sourceUrl);

    if (!scraper) {
      console.log(
        chalk.yellowBright(
          `Missing scraper for ${sourceUrlString} - ${imageUrl}`,
        ),
      );
      continue;
    }

    let sourceData: SourceData;

    console.log(
      chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {gray Scraping...}`,
    );

    try {
      sourceData = await scraper.scrape(sourceUrl, true);
    } catch (error: any) {
      const collectErrorMessages = (error: Error): string[] => [
        error.message,
        ...(error.cause ? collectErrorMessages(error.cause as Error) : []),
      ];
      const messages: string[] = collectErrorMessages(error);

      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {red ${messages.join(
          " - ",
        )}}`,
      );
      continue;
    }

    if (sourceData.images.length === 0) {
      continue;
    }

    if (sourceData.images.length !== 1) {
      // console.log(
      //   chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {yellowBright Skipping - has ${sourceData.images.length} images}`,
      // );
      // continue;
    }

    let imageData: SourceImageData | undefined;
    let hashMatch = false;

    if (sourceData.images.length === 1) {
      [imageData] = sourceData.images;
    } else if (sourceData.images.some((i) => i.selected)) {
      imageData = sourceData.images.find((i) => i.selected)!;
    } else {
      for (const sourceImage of sourceData.images) {
        if (!sourceImage.blob) {
          continue;
        }

        if (
          crypto
            .createHash("sha512")
            .update(Buffer.from(await sourceImage.blob.arrayBuffer()))
            .digest("hex") === image.orig_sha512_hash
        ) {
          imageData = sourceImage;
          hashMatch = true;
        }
      }

      if (imageData) {
        console.log(
          chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {yellowBright ${
            sourceData.images.length
          } images - picked ${sourceData.images.indexOf(imageData)} (hash match)}`,
        );
      } else {
        imageData = sourceData.images
          .map(
            (data) =>
              [
                data,
                Math.abs(image.width / image.height - data.width / data.height),
              ] as const,
          )
          .sort(([, a], [, b]) => a - b)[0][0];

        console.log(
          chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {yellowBright ${
            sourceData.images.length
          } images - picked ${sourceData.images.indexOf(imageData)} (closest aspect ratio)}`,
        );
      }
    }

    console.log(imageData);

    const isBetterDimensions =
      imageData.width > image.width || imageData.height > image.height;
    const isBetterFormat = imageData.type === "png" && image.format === "jpg";
    const isWorseFormat = imageData.type === "jpg" && image.format === "png";
    const isSameDimensions =
      numbersEqualWithinMargin(imageData.width, image.width, 1) &&
      numbersEqualWithinMargin(imageData.height, image.height, 1);
    const isSameAspectRatio =
      Math.abs(
        image.width / image.height - imageData.width / imageData.height,
      ) <= 0.009;

    if (isBetterDimensions && !(isSameDimensions && isWorseFormat)) {
      ok = false;
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {redBright ${
          imageData.width
        }x${imageData.height} ${imageData.type} (${sourceData.source}) vs ${
          image.width
        }x${image.height} ${image.format} (${booru.name})${
          isSameAspectRatio ? "" : " ! different aspect ratio"
        }}`,
      );
    }

    if (isSameDimensions && isBetterFormat) {
      ok = false;
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {redBright ${imageData.type} (${sourceData.source}) vs ${image.format} (${booru.name})}`,
      );
    }

    if (
      args.hashCheck &&
      ok &&
      image.width === imageData.width &&
      image.height === imageData.height &&
      image.format === imageData.type &&
      !hashMatch &&
      imageData.blob &&
      crypto
        .createHash("sha512")
        .update(Buffer.from(await imageData.blob.arrayBuffer()))
        .digest("hex") !== image.orig_sha512_hash
    ) {
      ok = false;
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {redBright hash mismatch: ${imageData.width}x${imageData.height} ${imageData.type} (${sourceData.source}) vs ${image.width}x${image.height} ${image.format} (${booru.name})}`,
      );
    }
  }

  if (ok) {
    console.log(chalkTemplate`{blueBright [${imageUrl}]} {greenBright OK}`);
  } else {
    console.log(
      chalkTemplate`{blueBright [${imageUrl}]} {cyanBright ${contextTags.join(
        ", ",
      )}}`,
    );
    await rl.question(chalk.gray("Press <enter> to continue..."));
  }
}

rl.close();
