import undici from "undici";
import LocalAutocompleter from "./local-autocompleter.ts";
import fs from "node:fs";
import { join as joinPath } from "node:path";

const CACHE_DIR = "derpibooru-autocomplete-cache";

async function fetchLocalAutocomplete(): Promise<LocalAutocompleter> {
  const now = new Date();
  const cacheKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const cacheFilePath = joinPath(CACHE_DIR, cacheKey);

  let buffer: ArrayBuffer;

  try {
    buffer = (await fs.promises.readFile(cacheFilePath)).buffer;
  } catch {
    const response = await undici.request(
      `https://derpibooru.org/autocomplete/compiled?vsn=2&key=${cacheKey}`,
      {
        headers: { "user-agent": "" },
        throwOnError: true,
      },
    );

    buffer = await response.body.arrayBuffer();

    await fs.promises.rm(CACHE_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(CACHE_DIR);
    await fs.promises.writeFile(cacheFilePath, Buffer.from(buffer));
  }

  return new LocalAutocompleter(buffer);
}

export const autocompleter = await fetchLocalAutocomplete();

export default function autocompleteTags(input: string): {
  name: string;
  imageCount: number;
}[] {
  return autocompleter.topK(input, 5);
}
