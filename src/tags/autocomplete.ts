import undici from "undici";
import LocalAutocompleter from "./local-autocompleter.ts";

async function fetchLocalAutocomplete(): Promise<LocalAutocompleter> {
  const now = new Date();
  const cacheKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  const response = await undici.request(
    `https://derpibooru.org/autocomplete/compiled?vsn=2&key=${cacheKey}`,
    {
      headers: { "user-agent": "" },
      throwOnError: true,
    },
  );
  const buffer = await response.body.arrayBuffer();

  return new LocalAutocompleter(buffer);
}

export const autocompleter = await fetchLocalAutocomplete();

export default function autocompleteTags(input: string): {
  name: string;
  imageCount: number;
}[] {
  return autocompleter.topK(input, 5);
}
