import util from "node:util";
import selectBoorus from "./booru-selector.js";
import TagLists from "./booru/tag-lists.js";
import inputTags from "./tag-input.js";

util.inspect.defaultOptions.depth = Infinity;

const boorus = await selectBoorus();
const tags = new TagLists(boorus);

await inputTags(tags);

console.log(tags);
