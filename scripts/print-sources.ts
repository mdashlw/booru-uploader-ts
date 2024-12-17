import util from "node:util";
import inputSources from "../src/input-sources.ts";

util.inspect.defaultOptions.depth = Infinity;

const sources = await inputSources({
  withPrimary: false,
  metadataOnly: true,
});

console.log(sources);
