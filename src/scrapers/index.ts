import { Scraper } from "../scraper/types.js";
import * as Bluesky from "./bluesky.js";
import * as Booru from "./booru.js";
import * as Boosty from "./boosty.js";
import * as Commishes from "./commishes.js";
import * as DeviantArt from "./deviantart.js";
import * as DiscordCdn from "./discord-cdn.js";
import * as E621 from "./e621.js";
import * as FurAffinity from "./furaffinity.js";
import * as FurryNetwork from "./furrynetwork.js";
import * as HentaiFoundry from "./hentai-foundry.js";
import * as Inkbunny from "./inkbunny.js";
import * as Itaku from "./itaku.js";
import * as Lofter from "./lofter.js";
import * as Mastodon from "./mastodon.js";
import * as Newgrounds from "./newgrounds.js";
// import * as PassThrough from "./pass-through.js";
import * as Pillowfort from "./pillowfort.js";
import * as Pixiv from "./pixiv.js";
import * as Raw from "./raw.js";
import * as Reddit from "./reddit.js";
import * as Stash from "./stash.js";
// import * as Tabun from "./tabun.js";
import * as Tumblr from "./tumblr.js";
import * as Twitter from "./twitter.js";
import * as Vk from "./vk.js";
import * as Weasyl from "./weasyl.js";
import * as YchArtAuction from "./ychart-auction.js";
import * as YchArtCdn from "./ychart-cdn.js";

export const scrapers: Scraper[] = [
  Bluesky,
  Booru,
  Boosty,
  Commishes,
  DeviantArt,
  DiscordCdn,
  E621,
  FurAffinity,
  FurryNetwork,
  HentaiFoundry,
  Inkbunny,
  Itaku,
  Lofter,
  Mastodon,
  Newgrounds,
  // PassThrough,
  Pillowfort,
  Pixiv,
  YchArtAuction,
  YchArtCdn,
  Raw,
  Reddit,
  Stash,
  // Tabun,
  Tumblr,
  Twitter,
  Vk,
  Weasyl,
];
