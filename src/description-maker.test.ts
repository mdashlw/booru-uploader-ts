import selectBoorus from "./booru-selector.js";
import makeDescription from "./description-maker.js";
import inputSources from "./source-input.js";

const sources = await inputSources();
const boorus = await selectBoorus();

console.log();
for (const booru of boorus) {
  console.log(booru.name);
  console.log(makeDescription(booru, sources));
  console.log();
}
