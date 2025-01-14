import fs from "node:fs";
import process from "node:process";
import { Cookie, CookieJar } from "tough-cookie";

const JAR_FILE = "_cookie-jar.json";

const jar = new CookieJar();

if (fs.existsSync(JAR_FILE)) {
  try {
    jar._importCookiesSync(JSON.parse(fs.readFileSync(JAR_FILE, "utf8")));
  } catch (error) {
    console.error();
    console.error("Failed to import cookies from the jar");
    console.error(error);
    console.error();
  }
}

const cookieExportFiles = fs
  .readdirSync(".")
  .filter((file) => file.includes("_cookies"));

for (const file of cookieExportFiles) {
  if (file.endsWith(".txt")) {
    fs.rmSync(file);
    console.error();
    console.error(`Unable to import cookies from ${file}`);
    console.error("Select JSON as Export Format");
    console.error();
    process.exit(1);
  }

  if (!file.endsWith(".json")) {
    console.error();
    console.error(`Unknown file format: ${file}`);
    console.error("Delete or rename the file");
    console.error();
    process.exit(1);
  }

  const contextDomain = file.substring(0, file.indexOf("_cookies"));
  const contextUrl = `https://${contextDomain}`;

  if (!contextDomain.includes(".")) {
    console.error();
    console.error(`Invalid file name: ${file}`);
    console.error("Do not rename the file when exporting");
    console.error();
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const cookie of cookies) {
    const cookieObject = new Cookie({
      key: cookie.name,
      value: cookie.value,
      expires: cookie.expirationDate
        ? new Date(cookie.expirationDate * 1_000)
        : null,
      domain: cookie.domain.startsWith(".")
        ? cookie.domain.substring(1)
        : cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      hostOnly: cookie.hostOnly,
      sameSite: cookie.sameSite,
    });

    jar.setCookieSync(cookieObject, contextUrl);
  }

  fs.rmSync(file);
  console.log(`Imported ${cookies.length} cookies from ${file}`);
}

async function exportJar() {
  await fs.promises.writeFile(
    JAR_FILE,
    JSON.stringify(await jar.serialize()),
    "utf8",
  );
}

await exportJar();

export function getCookieString(url: string) {
  const string = jar.getCookieStringSync(url);

  if (!string) {
    throw new Error(`No cookies for ${url}`);
  }

  return string;
}

export async function setCookies(
  url: string,
  setCookie: string | string[] | undefined,
) {
  if (!setCookie) {
    return;
  }

  if (typeof setCookie === "string") {
    setCookie = [setCookie];
  }

  for (const cookie of setCookie) {
    jar.setCookieSync(cookie, url);
  }

  await exportJar();
}
