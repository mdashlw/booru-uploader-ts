import type { IncomingHttpHeaders } from "undici/types/header.ts";
import undici from "undici";
import * as cheerio from "cheerio";
import process from "node:process";
import fs from "node:fs";

const USERNAME = process.env.DEVIANTART_USERNAME;
const PASSWORD = process.env.DEVIANTART_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.log("Missing DeviantArt username or password");
  process.exit(1);
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BASE_HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  dnt: "1",
  pragma: "no-cache",
  priority: "u=0, i",
  "sec-ch-ua":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-viewport-height": "454",
  "sec-ch-viewport-width": "1920",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": USER_AGENT,
  origin: "https://www.deviantart.com",
};

const pool = new undici.Pool("https://www.deviantart.com", {
  connect: {
    maxVersion: "TLSv1.2",
  },
});

function extractForm(html: string) {
  const $ = cheerio.load(html);
  const form = $("form:first-of-type");
  const action = form.attr("action");

  if (!action) {
    throw new Error("form has no action");
  }

  const inputs = Object.fromEntries(
    form
      .find("input")
      .toArray()
      .map((el, i) => {
        const $el = $(el);
        const name = $el.attr("name");
        const value = $el.attr("value");

        if (!name) {
          throw new Error(`input ${i} has no name`);
        }

        if (value === undefined) {
          throw new Error(`input ${i} ("${name}") has no value`);
        }

        return [name, value];
      }),
  );

  return {
    action,
    inputs,
  };
}

function parseCookie(setCookieHeader: string) {
  return setCookieHeader.split("; ")[0].split("=") as [string, string];
}

function parseAllCookies(headers: IncomingHttpHeaders) {
  let setCookie = headers["set-cookie"];

  if (setCookie === undefined) {
    return [];
  }

  if (typeof setCookie === "string") {
    setCookie = [setCookie];
  }

  return Object.fromEntries(setCookie.map((c) => parseCookie(c)));
}

async function doStep1() {
  const response = await pool.request({
    method: "GET",
    path: "/users/login",
    headers: BASE_HEADERS,
    throwOnError: true,
  });
  const cookies = parseAllCookies(response.headers);
  const html = await response.body.text();
  const form = extractForm(html);

  return { cookies, form };
}

async function doStep2(
  step1: Awaited<ReturnType<typeof doStep1>>,
  username: string,
) {
  const response = await pool.request({
    method: "POST",
    path: step1.form.action,
    headers: {
      ...BASE_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
      referer: "https://www.deviantart.com/users/login",
      cookie: Object.entries(step1.cookies)
        .map(([n, v]) => `${n}=${v}`)
        .join("; "),
    },
    body: new URLSearchParams({
      ...step1.form.inputs,
      username,
    }).toString(),
    throwOnError: true,
  });

  if (response.statusCode !== 200) {
    throw new Error(`bad response: ${response.statusCode}`);
  }

  const html = await response.body.text();
  const form = extractForm(html);

  return form;
}

async function signIn(username: string, password: string) {
  const step1 = await doStep1();
  const step2 = await doStep2(step1, username);

  let response = await pool.request({
    method: "POST",
    path: step2.action,
    headers: {
      ...BASE_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
      referer: "https://www.deviantart.com" + step1.form.action,
      cookie: Object.entries(step1.cookies)
        .map(([n, v]) => `${n}=${v}`)
        .join("; "),
    },
    body: new URLSearchParams({
      ...step2.inputs,
      password,
    }).toString(),
    throwOnError: true,
  });

  if (response.statusCode !== 301) {
    throw new Error(`bad response: ${response.statusCode}`);
  }

  const cookies = parseAllCookies(response.headers);
  const cookiesString = Object.entries(cookies)
    .filter(([, v]) => v !== "deleted")
    .map(([n, v]) => `${n}=${v}`)
    .join("; ");

  response = await pool.request({
    method: "GET",
    path: response.headers["location"] as string,
    headers: {
      ...BASE_HEADERS,
      cookie: cookiesString,
    },
    throwOnError: true,
  });

  const html = await response.body.text();

  const csrfToken = /__CSRF_TOKEN__ = '(.+?)';/.exec(html)?.[1];

  await fs.promises.writeFile(
    ".env",
    (await fs.promises.readFile(".env", "utf8"))
      .replace(/^DEVIANTART_COOKIE=.*$/gm, `DEVIANTART_COOKIE=${cookiesString}`)
      .replace(
        /^DEVIANTART_CSRF_TOKEN=.*$/gm,
        `DEVIANTART_CSRF_TOKEN=${csrfToken}`,
      ),
    "utf8",
  );
}

await signIn(USERNAME, PASSWORD);
