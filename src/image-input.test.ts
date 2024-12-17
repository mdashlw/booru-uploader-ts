import util from "node:util";
import selectImage from "./select-image.ts";
import inputSources from "./input-sources.ts";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources({
  withPrimary: true,
  metadataOnly: false,
});
const image = await selectImage(sources.primary);

console.log(image);
