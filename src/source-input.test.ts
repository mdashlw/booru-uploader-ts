import util from "node:util";
import inputSources from "./source-input.js";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources();

console.log(sources);
