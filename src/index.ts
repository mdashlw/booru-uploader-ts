import { confirm, select } from "@inquirer/prompts";
import process from "node:process";
import util from "node:util";
import selectBoorus from "./booru-selector.ts";
import makeDescription from "./make-description.ts";
import selectImage from "./select-image.ts";
import { ratingTags } from "./rating-tags.ts";
import inputSources from "./input-sources.ts";
import { fetchTagsByNames } from "./tags/fetch.ts";
import promptTags from "./tags/prompt.ts";

util.inspect.defaultOptions.depth = Infinity;

process.on("unhandledRejection", (reason) => {
  console.error(reason);
});

const sources = await inputSources({
  withPrimary: true,
  metadataOnly: false,
});
const image = await selectImage(sources.primary, true);

for (const source of sources.alternate) {
  await selectImage(source);
}

console.log(sources);

console.log("\n");
console.table(
  [sources.primary, ...sources.alternate].map((source) => {
    const image = source.images.find((i) => i.selected);

    return {
      source: source.source,
      width: image?.width,
      height: image?.height,
      type: image?.type,
      size: image?.blob?.size,
    };
  }),
);
console.log("\n");

const boorus = await selectBoorus();

const ratingTag = await select({
  message: "Rating",
  choices: ratingTags.map((value) => ({ value })),
});

const tags = await fetchTagsByNames([ratingTag]);

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
  boorus.map((booru) =>
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
      sourceUrl: image.pageUrl ?? sources.primary.url,
      sourceUrls: [sources.primary, ...sources.alternate].flatMap((source) => {
        const image = source.images.find((i) => i.selected);

        if (image?.pageUrl) {
          if (source.imagePageUrlsAreStandalone) {
            return [source.url, image.pageUrl];
          } else {
            return [image.pageUrl];
          }
        } else {
          return [source.url];
        }
      }),
      description: makeDescription(booru, [
        sources.primary,
        ...sources.alternate,
      ]),
    }),
  ),
);

process.stdout.write("\u0007");
