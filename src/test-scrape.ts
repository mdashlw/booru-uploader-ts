import scrape from "./scraper.js";

const res = await scrape(
  new URL(
    "https://www.deviantart.com/falafeljake/art/Finished-sketch-commission-967278122",
  ),
);

console.log(res);
