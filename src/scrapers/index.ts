import { Scraper } from "../scraper/types.js";
import * as Commishes from "./commishes.js";
import * as DeviantArt from "./deviantart-other.js";
import * as FurAffinity from "./furaffinity.js";
import * as Tumblr from "./tumblr.js";
import * as Twitter from "./twitter.js";

export const scrapers: Scraper[] = [
  Commishes,
  DeviantArt,
  FurAffinity,
  Tumblr,
  Twitter,
];
