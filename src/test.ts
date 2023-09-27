import _ from "lodash";
import { TagName } from "./booru/types.js";
import Derpibooru from "./boorus/derpibooru.js";

const booru = new Derpibooru();
// const tagList = new TagList(booru);

// const resolvedTags = await tagList.resolveOne(
//   await booru.fetchTagByName("twidash")
// );

// console.log(resolvedTags.map((t) => `- ${t.id} ${t.name}`).join("\n"));

const tags = [
  await booru.fetchTagByName("shipping" as TagName),
  await booru.fetchTagByName("twilight sparkle" as TagName),
  // await booru.fetchTagByName("rainbow dash"),
];

const implications = new Map();

for (const tag of tags) {
  for (const imlpiedByTag of tag?.implied_by_tags) {
    if (!implications.has(imlpiedByTag)) {
      implications.set(imlpiedByTag, []);
    }

    implications.get(imlpiedByTag).push(tag.name);
  }
}

for (const [implication, sharedTags] of implications) {
  if (sharedTags.length > 1) {
    const implicationTag = await booru.fetchTagBySlug(implication);

    if (
      implicationTag?.implied_tags.every((impliedTag) =>
        tags.some((t) => t.slug === impliedTag)
      )
    ) {
      console.log(implication, sharedTags);
    }
  }
}
