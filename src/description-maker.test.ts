import clipboard from "clipboardy";
import { boorus } from "./boorus.ts";
import makeDescription from "./description-maker.ts";
import inputSources from "./source-input.ts";
import selectImage from "./image-selector.ts";

const sources = await inputSources(true);
await selectImage(sources.primary);
const booru = boorus[0];

const description = makeDescription(booru, sources);

console.log(description);
await clipboard.write(description);
