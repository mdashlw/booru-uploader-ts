import util from "node:util";
import { Tag } from "./tags/index.js";
import promptTags from "./tags/prompt.js";

util.inspect.defaultOptions.depth = Infinity;

const tags: Tag[] = [];

await promptTags(tags);

console.log(tags);
