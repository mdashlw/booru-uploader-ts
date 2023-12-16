import util from "node:util";
import selectImage from "./image-selector.js";
import inputSources from "./source-input.js";
import probeImageSize from "./utils/probe-image-size.js";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources();
const image = await selectImage(sources.primary);

const url = typeof image.url === "string" ? image.url : await image.url();
let { type, width, height } = image;

if (!Number.isInteger(width) || !Number.isInteger(height) || !type) {
  ({ type, width, height } = await probeImageSize(url));
}

console.log({
  url,
  type,
  width,
  height,
});
