import util from "node:util";
import inputSources from "./source-input.ts";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources(true);

console.log(sources);
