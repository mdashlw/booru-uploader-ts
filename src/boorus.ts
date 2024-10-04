import process from "node:process";
import Booru from "./booru/index.ts";
import Derpibooru from "./boorus/derpibooru.ts";
import Manebooru from "./boorus/manebooru.ts";

export const boorus: Booru[] = [
  new Derpibooru({
    key: process.env.DERPIBOORU_API_KEY,
  }),
  new Manebooru({
    key: process.env.MANEBOORU_API_KEY,
  }),
];
