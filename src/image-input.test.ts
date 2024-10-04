import util from "node:util";
import selectImage from "./image-selector.ts";
import inputSources from "./source-input.ts";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources();
const image = await selectImage(sources.primary);

console.log(image);
