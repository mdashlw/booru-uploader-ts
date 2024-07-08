import autocomplete from "inquirer-autocomplete-standalone";
import autocompleteTags from "./autocomplete.js";
import { fetchTagsByNames } from "./fetch.js";
import { Tag } from "./index.js";
import { printTags } from "./print.js";

export default async function promptTags(tags: Tag[]) {
  while (true) {
    console.log();
    await printTags(tags);
    console.log();

    const tagInput = await autocomplete({
      message: "Tags...",
      source: async (input) => {
        input = input?.trim();

        if (!input) {
          return [];
        }

        const otherInputs = input.trimStart().split(/((?:, *-|,|^-) *)/);
        const lastInput = otherInputs.pop()!;

        return autocompleteTags(lastInput).map(({ name, imageCount }) => ({
          value: [...otherInputs, name].join(""),
          name: `${name} (${imageCount.toLocaleString("en-US")})`,
        }));
      },
      pageSize: 100,
      suggestOnly: true,
    });

    if (!tagInput) {
      break;
    }

    const addedTags = [];

    for (const input of tagInput.split(",").map((name) => name.trim())) {
      if (!input) {
        continue;
      }

      if (input.startsWith("-")) {
        const tagName = input.substring(1).trimStart();

        if (!tagName) {
          continue;
        }

        let index = tags.findIndex((tag) => tag.name === tagName);
        if (index !== -1) {
          tags.splice(index, 1);
        }

        index = addedTags.findIndex((tag) => tag === tagName);
        if (index !== -1) {
          addedTags.splice(index, 1);
        }
      } else {
        if (!tags.some((tag) => tag.name === input)) {
          addedTags.push(input);
        }
      }
    }

    if (addedTags.length) {
      tags.push(...(await fetchTagsByNames(addedTags)));
    }
  }
}
