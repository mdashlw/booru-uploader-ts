import { confirm, select } from "@inquirer/prompts";
import process from "node:process";
import util from "node:util";
import selectBoorus from "./booru-selector.js";
import TagLists from "./booru/tag-lists.js";
import { TagName } from "./booru/types.js";
import makeDescription from "./description-maker.js";
import selectImage from "./image-selector.js";
import { ratingTags } from "./rating-tags.js";
import inputSources from "./source-input.js";
import inputTags from "./tag-input.js";

util.inspect.defaultOptions.depth = Infinity;

process.on("unhandledRejection", (reason) => {
  console.error(reason);
});

const sources = await inputSources();
const image = await selectImage(sources.primary);

const boorus = await selectBoorus();

const tags = new TagLists(boorus);

const ratingTag = await select({
  message: "Rating",
  choices: ratingTags.map((value) => ({ value })),
});
await tags.addByName(ratingTag as TagName);

while (true) {
  await inputTags(tags);

  const confirmAnswer = await confirm({
    message: "Confirm?",
    default: true,
  });

  if (confirmAnswer) {
    break;
  }
}

await Promise.allSettled(
  boorus.map((booru) => {
    booru.postImage({
      blob: image.blob,
      filename: image.filename,
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
