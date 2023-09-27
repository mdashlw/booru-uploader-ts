import process from "node:process";
import Booru from "./booru/index.js";
import Derpibooru from "./boorus/derpibooru.js";
import Manebooru from "./boorus/manebooru.js";

export const boorus: Booru[] = [
  new Derpibooru({
    key: process.env.DERPIBOORU_API_KEY,
  }),
  new Manebooru({
    key: process.env.MANEBOORU_API_KEY,
  }),
];
