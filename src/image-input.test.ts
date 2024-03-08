import util from "node:util";
import selectImage from "./image-selector.js";
import inputSources from "./source-input.js";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources();
const image = await selectImage(sources.primary);

console.log(image);
