import { Scraper } from "../scraper/types.js";
import * as Boosty from "./boosty.js";
import * as Commishes from "./commishes.js";
import * as DeviantArt from "./deviantart-other.js";
import * as FurAffinity from "./furaffinity.js";
import * as Itaku from "./itaku.js";
import * as PassThrough from "./pass-through.js";
import * as Raw from "./raw.js";
import * as Tabun from "./tabun.js";
import * as Tumblr from "./tumblr.js";
import * as Twitter from "./twitter.js";

export const scrapers: Scraper[] = [
  Boosty,
  Commishes,
  DeviantArt,
  FurAffinity,
  Itaku,
  PassThrough,
  Raw,
  Tabun,
  Tumblr,
  Twitter,
];
