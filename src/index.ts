import { confirm, select } from "@inquirer/prompts";
import process from "node:process";
import util from "node:util";
import selectBoorus from "./booru-selector.js";
import makeDescription from "./description-maker.js";
import selectImage from "./image-selector.js";
import { ratingTags } from "./rating-tags.js";
import inputSources from "./source-input.js";
import { fetchTagsByNames } from "./tags/fetch.js";
import { Tag } from "./tags/index.js";
import promptTags from "./tags/prompt.js";

util.inspect.defaultOptions.depth = Infinity;

process.on("unhandledRejection", (reason) => {
  console.error(reason);
});

const sources = await inputSources();
const image = await selectImage(sources.primary);

const boorus = await selectBoorus();

const ratingTag = await select({
  message: "Rating",
  choices: ratingTags.map((value) => ({ value })),
});

const tags: Tag[] = await fetchTagsByNames([ratingTag]);

while (true) {
  await promptTags(tags);

  console.log(tags.map((tag) => tag.name).join(", "));

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
          .flatMap((source) => source.artist)
          .filter(Boolean)
          .map((artist) => `artist:${artist}`),
        ...tags.map((tag) => tag.name),
      ],
      sourceUrl: sources.primary.url,
      sourceUrls: [sources.primary, ...sources.alternate].map(
        (source) => source.url,
      ),
      description: makeDescription(booru, sources),
    });
  }),
);
