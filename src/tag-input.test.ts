import util from "node:util";
import selectBoorus from "./booru-selector.ts";
import TagLists from "./booru/tag-lists.ts";
import inputTags from "./tag-input.ts";

util.inspect.defaultOptions.depth = Infinity;

const boorus = await selectBoorus();
const tags = new TagLists(boorus);

await inputTags(tags);

console.log(tags);
