import { select } from "@inquirer/prompts";
import clipboard from "clipboardy";
import { boorus } from "./boorus.js";
import makeDescription from "./description-maker.js";
import inputSources from "./source-input.js";

const sources = await inputSources(true);

while (true) {
  const booru = await select({
    message: "Booru",
    choices: boorus.map((booru) => ({
      name: booru.name,
      value: booru,
    })),
  });

  const description = makeDescription(booru, sources);

  console.log(description);
  await clipboard.write(description);
}
