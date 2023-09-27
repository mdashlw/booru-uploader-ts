import inquirer from "inquirer";
import process from "node:process";
import util from "node:util";
import selectBoorus from "./booru-selector.js";
import TagLists from "./booru/tag-lists.js";
import makeDescription from "./description-maker.js";
import selectImage from "./image-selector.js";
import { ratingTags } from "./rating-tags.js";
import inputSources from "./source-input.js";
import inputTags from "./tag-input.js";

util.inspect.defaultOptions.depth = Infinity;

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const sources = await inputSources();
const image = await selectImage(sources.primary);

const boorus = await selectBoorus();

const tags = new TagLists(boorus);

const { ratingTag } = await inquirer.prompt({
  type: "list",
  name: "ratingTag",
  message: "Rating",
  choices: ratingTags,
});
await tags.addByName(ratingTag);

while (true) {
  await inputTags(tags);

  const { confirm } = await inquirer.prompt({
    type: "confirm",
    name: "confirm",
    message: "Confirm?",
  });

  if (confirm) {
    break;
  }
}

const imageUrl = typeof image.url === "string" ? image.url : await image.url();

await Promise.allSettled(
  boorus.map(async (booru) => {
    await booru.postImage({
      imageUrl: imageUrl,
      tags: [
        ...[sources.primary, ...sources.alternate]
          .filter((source) => source.artist)
          .map((source) => `artist:${source.artist}`),
        ...tags.getList(booru)!.names,
      ],
      sourceUrl: sources.primary.url,
      sourceUrls: [sources.primary, ...sources.alternate].map(
        (source) => source.url,
      ),
      description: makeDescription(booru, sources),
    });
  }),
);
