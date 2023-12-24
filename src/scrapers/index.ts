import { Scraper } from "../scraper/types.js";
// import * as Booru from "./booru.js";
import * as Boosty from "./boosty.js";
import * as Commishes from "./commishes-api.js";
import * as DeviantArt from "./deviantart-other.js";
import * as FurAffinity from "./furaffinity.js";
// import * as Itaku from "./itaku.js";
// import * as Lofter from "./lofter.js";
// import * as PassThrough from "./pass-through.js";
// import * as Pixiv from "./pixiv.js";
// import * as Raw from "./raw.js";
// import * as Tabun from "./tabun.js";
import * as Tumblr from "./tumblr.js";
import * as Twitter from "./twitter.js";
// import * as Vk from "./vk.js";

export const scrapers: Scraper[] = [
  // Booru,
  Boosty,
  Commishes,
  DeviantArt,
  FurAffinity,
  // Itaku,
  // Lofter,
  // PassThrough,
  // Pixiv,
  // Raw,
  // Tabun,
  Tumblr,
  Twitter,
  // Vk,
];
