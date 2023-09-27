import inquirer, { Answers, ChoiceCollection } from "inquirer";
import inquirerPrompt from "inquirer-autocomplete-prompt";
import TagLists from "./booru/tag-lists.js";
import { debounceAsync } from "./lodash.js";

inquirer.registerPrompt("autocomplete", inquirerPrompt);

export default async function inputTags(tags: TagLists) {
  while (true) {
    console.log();
    await tags.printAll();

    const { tagInput } = await inquirer.prompt([
      {
        type: "autocomplete",
        name: "tagInput",
        message: "Tags...",
        source: debounceAsync(
          async (
            _: Answers,
            term: string | null,
          ): Promise<ChoiceCollection> => {
            if (!term) {
              return [];
            }

            let prefix = "";

            if (term.includes(",")) {
              const lastCommaIndex = term.lastIndexOf(",");
              const newTerm = term.substring(lastCommaIndex + 1);
              const trimmedNewTerm = newTerm.trimStart();

              prefix = term.substring(
                0,
                lastCommaIndex + 1 + (newTerm.length - trimmedNewTerm.length),
              );
              term = trimmedNewTerm;
            } else {
              term = term.trimStart();
            }

            if (term.startsWith("-")) {
              prefix += "-";
              term = term.substring(1);
            }

            if (!term) {
              return [];
            }

            return (
              await Promise.all(
                tags.boorus.map(async (booru, index, boorus) => {
                  const tags = await booru
                    .autocompleteTags(term!)
                    .catch((error) => {
                      console.error(
                        new Error(
                          `Failed to autocomplete tags for "${term}" on ${booru.name}`,
                          { cause: error },
                        ),
                      );
                      return [];
                    });
                  const choices: ChoiceCollection = tags.map(
                    ({ label, value }) => ({
                      name: label,
                      value: prefix + value,
                    }),
                  );

                  if (index !== boorus.length - 1) {
                    choices.push(new inquirer.Separator());
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
      },
    ]);

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

        await tags.removeByName(tagName);
        continue;
      }

      await tags.addByName(tagName);
    }
  }
}
