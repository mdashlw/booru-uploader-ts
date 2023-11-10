import chalk from "chalk";
import chalkTemplate from "chalk-template";
import process from "node:process";
import readline from "node:readline/promises";
import util from "node:util";
import { Image, TagName } from "../src/booru/types.js";
import { boorus } from "../src/boorus.js";
import { ratingTags } from "../src/rating-tags.js";
import { findScraper } from "../src/scraper.js";
import { SourceData } from "../src/scraper/types.js";

util.inspect.defaultOptions.depth = Infinity;

const { values: args } = util.parseArgs({
  options: {
    booru: { type: "string" },
    query: { type: "string" },
    sort: { type: "string" },
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
const { perPage, filterId, selfUserId } = {
  perPage: 50,
  ...{
    Derpibooru: {
      filterId: 56027,
      selfUserId: 600220,
    },
    Manebooru: {
      filterId: 2,
      selfUserId: 1998,
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
        q: query.replaceAll("{selfUserId}", selfUserId.toString()),
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
      sourceData = await scraper.scrape(sourceUrl);
    } catch (error: any) {
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {red ${error.message}}`,
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

    const imageData = sourceData.images[0];
    const sameAspectRatio =
      Math.trunc((image.width / image.height) * 100) ===
      Math.trunc((imageData.width / imageData.height) * 100);

    if (image.width < imageData.width || image.height < imageData.height) {
      ok = false;
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {redBright ${
          imageData.width
        }x${imageData.height} ${imageData.type} (${sourceData.source}) vs ${
          image.width
        }x${image.height} ${image.format} (${booru.name})${
          sameAspectRatio ? "" : " ! different aspect ratio"
        }}`,
      );
    }

    if (
      image.width === imageData.width &&
      image.height === imageData.height &&
      image.format === "jpg" &&
      imageData.type === "png"
    ) {
      ok = false;
      console.log(
        chalkTemplate`{blueBright [${imageUrl}]} {magentaBright [${sourceUrlString}]} {redBright ${imageData.type} (${sourceData.source}) vs ${image.format} (${booru.name})}`,
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
