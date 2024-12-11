import type { Scraper } from "../scraper/types.ts";
import * as ArtStation from "./artstation.ts";
import * as Behance from "./behance.ts";
import * as Bluesky from "./bluesky.ts";
import * as Booru from "./booru.ts";
import * as Boosty from "./boosty.ts";
import * as Cara from "./cara.ts";
import * as Commishes from "./commishes.ts";
import * as DeviantArt from "./deviantart.ts";
import * as DiscordCdn from "./discord-cdn.ts";
import * as E621 from "./e621.ts";
import * as FurAffinity from "./furaffinity.ts";
import * as FurryNetwork from "./furrynetwork.ts";
import * as HentaiFoundry from "./hentai-foundry.ts";
import * as Imgur from "./imgur.ts";
import * as Inkbunny from "./inkbunny.ts";
import * as Instagram from "./instagram.ts";
import * as Itaku from "./itaku.ts";
import * as Lofter from "./lofter.ts";
import * as Mastodon from "./mastodon.ts";
import * as Newgrounds from "./newgrounds.ts";
import * as PassThrough from "./pass-through.ts";
import * as Pillowfort from "./pillowfort.ts";
import * as Pixiv from "./pixiv.ts";
import * as PottoArt from "./pottoart.ts";
import * as Raw from "./raw.ts";
import * as Reddit from "./reddit.ts";
import * as Stash from "./stash.ts";
// import * as Tabun from "./tabun.ts";
import * as Tumblr from "./tumblr.ts";
import * as Twitter from "./twitter.ts";
import * as Vk from "./vk.ts";
import * as Weasyl from "./weasyl.ts";
import * as Xiaohongshu from "./xiaohongshu.ts";
import * as YchArtAuction from "./ychart-auction.ts";
import * as YchArtCdn from "./ychart-cdn.ts";

export const scrapers: Scraper[] = [
  ArtStation,
  Behance,
  Bluesky,
  Booru,
  Boosty,
  Cara,
  Commishes,
  DeviantArt,
  DiscordCdn,
  E621,
  FurAffinity,
  FurryNetwork,
  HentaiFoundry,
  Imgur,
  Inkbunny,
  // Instagram,
  Itaku,
  Lofter,
  Mastodon,
  Newgrounds,
  Pillowfort,
  Pixiv,
  PottoArt,
  YchArtAuction,
  YchArtCdn,
  Raw,
  Reddit,
  // Stash,
  // Tabun,
  Tumblr,
  Twitter,
  Vk,
  Weasyl,
  Xiaohongshu,
  PassThrough,
];
