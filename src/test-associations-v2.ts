import util from "node:util";
import Derpibooru from "../lib/boorus/derpibooru.js";
import { Image } from "./booru/types.js";

util.inspect.defaultOptions.compact = Infinity;
util.inspect.defaultOptions.breakLength = Infinity;
util.inspect.defaultOptions.depth = Infinity;

interface Result {
  name: string;
  imageCount: number;
}

/**
 * Compare two strings, C-style.
 */
function strcmp(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

/**
 * Returns the name of a tag without any namespace component.
 */
function nameInNamespace(s: string): string {
  const v = s.split(":", 2);

  if (v.length === 2) return v[1];
  return v[0];
}

/**
 * See lib/philomena/autocomplete.ex for binary structure details.
 *
 * A binary blob is used to avoid the creation of large amounts of garbage on
 * the JS heap and speed up the execution of the search.
 */
class LocalAutocompleter {
  private data: Uint8Array;
  private view: DataView;
  private decoder: TextDecoder;
  private numTags: number;
  private referenceStart: number;
  private formatVersion: number;

  /**
   * Build a new local autocompleter.
   */
  constructor(backingStore: ArrayBuffer) {
    this.data = new Uint8Array(backingStore);
    this.view = new DataView(backingStore);
    this.decoder = new TextDecoder();
    this.numTags = this.view.getUint32(backingStore.byteLength - 4, true);
    this.referenceStart = this.view.getUint32(
      backingStore.byteLength - 8,
      true,
    );
    this.formatVersion = this.view.getUint32(
      backingStore.byteLength - 12,
      true,
    );

    if (this.formatVersion !== 2) {
      throw new Error("Incompatible autocomplete format version");
    }
  }

  getTagFromLocation(location: number): string {
    const nameLength = this.view.getUint8(location);
    const name = this.decoder.decode(
      this.data.slice(location + 1, location + nameLength + 1),
    );

    return name;
  }

  /**
   * Get a Result object as the ith tag inside the file.
   */
  getResultAt(i: number): [string, Result] {
    const nameLocation = this.view.getUint32(this.referenceStart + i * 8, true);
    const imageCount = this.view.getInt32(
      this.referenceStart + i * 8 + 4,
      true,
    );
    const name = this.getTagFromLocation(nameLocation);

    if (imageCount < 0) {
      // This is actually an alias, so follow it
      return [name, this.getResultAt(-imageCount - 1)[1]];
    }

    return [name, { name, imageCount }];
  }

  /**
   * Perform a binary search to fetch all results matching a condition.
   */
  scanResults(
    getResult: (i: number) => [string, Result],
    compare: (name: string) => number,
    results: Result[],
  ) {
    let min = 0;
    let max = this.numTags;

    while (min < max - 1) {
      const med = (min + (max - min) / 2) | 0;
      const sortKey = getResult(med)[0];

      if (compare(sortKey) >= 0) {
        // too large, go left
        max = med;
      } else {
        // too small, go right
        min = med;
      }
    }

    // Scan forward until no more matches occur
    while (min < this.numTags - 1) {
      const [sortKey, result] = getResult(++min);
      if (compare(sortKey) !== 0) {
        break;
      }

      results.push(result);
    }
  }

  findOne(query: string): Result {
    const results: Result[] = [];

    const prefixMatch = (name: string) => strcmp(name, query);
    this.scanResults(this.getResultAt.bind(this), prefixMatch, results);

    // console.log({ query, results });
    return results[0];
  }
}

function fetchLocalAutocomplete(): Promise<LocalAutocompleter> {
  const now = new Date();
  const cacheKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  return fetch(
    `https://derpibooru.org/autocomplete/compiled?vsn=2&key=${cacheKey}`,
    {
      credentials: "omit",
      cache: "force-cache",
    },
  )
    .then((resp) => resp.arrayBuffer())
    .then((buf) => new LocalAutocompleter(buf));
}

const booru = new Derpibooru();
const autocompleter = await fetchLocalAutocomplete();

async function fetchTagAssociations(tag: string) {
  const inputTag = autocompleter.findOne(tag);
  const sampleSize = 500;
  const randomSort = `random:${Date.now()}`;
  const [imagesWithTag, imagesWithoutTag] = await Promise.all([
    booru.searchImages({
      query: tag,
      sort: randomSort,
      limit: sampleSize,
    }),
    booru.searchImages({
      query: `-${tag}`,
      sort: randomSort,
      limit: sampleSize,
    }),
  ]);

  const allTags = Array.from(
    new Set([
      ...imagesWithTag.flatMap((i) => i.tags),
      ...imagesWithoutTag.flatMap((i) => i.tags),
    ]),
  )
    .map((name) => autocompleter.findOne(name))
    .filter(Boolean);

  const associations = allTags.map((t) => {
    if (t.imageCount > inputTag.imageCount) {
      return null;
    }

    const overlapWith =
      imagesWithTag.filter((i) => i.tags.includes(t.name)).length /
      Math.min(inputTag.imageCount, sampleSize);
    const overlapWithout =
      imagesWithoutTag.filter((i) => i.tags.includes(t.name)).length /
      Math.min(inputTag.imageCount, sampleSize);
    const overlapDiff = (overlapWith - overlapWithout) / overlapWithout;

    // console.log({ tag: t.name, overlapWith, overlapWithout, overlapDiff });
    // return overlapWith >= 0.3 && overlapDiff > 1;
    return {
      tag: t.name,
      overlapWith,
      overlapWithout,
      overlapDiff: overlapDiff === Infinity ? 0 : overlapDiff,
    };
  });

  console.log("associations");
  associations
    .filter((a) => a)
    .sort((a, b) => b?.overlapDiff - a?.overlapDiff)
    .slice(0, 25)
    .forEach((t) => console.log(t));
}

await fetchTagAssociations("rainbow dash");
