import { select } from "@inquirer/prompts";
import clipboard from "clipboardy";
import { boorus } from "./boorus.ts";
import makeDescription from "./description-maker.ts";
import inputSources from "./source-input.ts";

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
