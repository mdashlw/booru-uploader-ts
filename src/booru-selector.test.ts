import util from "node:util";
import selectBoorus from "./booru-selector.ts";

util.inspect.defaultOptions.depth = Infinity;

const boorus = await selectBoorus();

console.log(boorus);
