import clipboard from "clipboardy";
import { boorus } from "../src/boorus.ts";
import makeDescription from "../src/make-description.ts";
import inputSources from "../src/input-sources.ts";
import selectImage from "../src/select-image.ts";

const booru = boorus[0];

const sources = await inputSources({
  withPrimary: false,
  metadataOnly: true,
});

for (const source of sources) {
  await selectImage(source);
}

const description = makeDescription(booru, sources);

console.log("\n\n");
console.log(description);
await clipboard.write(description);
