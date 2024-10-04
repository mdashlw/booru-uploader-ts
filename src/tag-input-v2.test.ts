import util from "node:util";
import { type Tag } from "./tags/index.ts";
import promptTags from "./tags/prompt.ts";

util.inspect.defaultOptions.depth = Infinity;

const tags: Tag[] = [];

await promptTags(tags);

console.log(tags);
