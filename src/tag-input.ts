import { Separator } from "@inquirer/prompts";
import { type ChoiceOrSeparatorArray } from "inquirer-autocomplete-standalone";
import autocomplete from "inquirer-autocomplete-standalone";
import TagLists from "./booru/tag-lists.ts";
import type { TagName } from "./booru/types.ts";
import { debounceAsync } from "./lodash.ts";

export default async function inputTags(tags: TagLists) {
  const userInput: string[] = [];

  while (true) {
    console.log();
    await tags.printAll();

    const tagInput = await autocomplete({
      message: "Tags...",
      source: debounceAsync(
        async (
          input: string | undefined,
        ): Promise<ChoiceOrSeparatorArray<string>> => {
          if (!input) {
            return [];
          }

          let prefix = "";

          if (input.includes(",")) {
            const lastCommaIndex = input.lastIndexOf(",");
            const newTerm = input.substring(lastCommaIndex + 1);
            const trimmedNewTerm = newTerm.trimStart();

            prefix = input.substring(
              0,
              lastCommaIndex + 1 + (newTerm.length - trimmedNewTerm.length),
            );
            input = trimmedNewTerm;
          } else {
            input = input.trimStart();
          }

          if (input.startsWith("-")) {
            prefix += "-";
            input = input.substring(1);
          }

          if (!input) {
            return [];
          }

          return (
            await Promise.all(
              tags.boorus.map(async (booru, index, boorus) => {
                const tags = await booru
                  .autocompleteTags(input!)
                  .catch((error) => {
                    console.error(
                      new Error(
                        `Failed to autocomplete tags for "${input}" on ${booru.name}`,
                        { cause: error },
                      ),
                    );
                    return [];
                  });
                const choices: any = tags.map(({ label, value }) => ({
                  name: label,
                  value: prefix + value,
                }));

                if (index !== boorus.length - 1) {
                  choices.push(new Separator());
                }

                return choices;
              }),
            )
          ).flat();
        },
        100,
      ),
      pageSize: Infinity,
      suggestOnly: true,
    });

    if (!tagInput) {
      break;
    }

    for (let tagName of tagInput.split(",")) {
      tagName = tagName.trim();

      if (!tagName) {
        continue;
      }

      if (tagName.startsWith("-")) {
        tagName = tagName.substring(1);

        if (!tagName) {
          continue;
        }

        userInput.splice(userInput.indexOf(tagName), 1);
        await tags.removeByName(tagName as TagName);
        continue;
      }

      userInput.push(tagName);
      await tags.addByName(tagName as TagName);
    }
  }

  console.log(userInput.join(", "));
}
