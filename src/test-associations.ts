import _ from "lodash";
import util from "node:util";
import { Tag } from "./booru/types.js";
import Derpibooru from "./boorus/derpibooru.js";

// References:
// - https://github.com/derpibooru/philomena/blob/master/lib/philomena/autocomplete.ex
// - https://github.com/derpibooru/philomena/blob/master/lib/philomena_web/controllers/autocomplete/compiled_controller.ex
// - https://github.com/derpibooru/philomena/blob/master/assets/js/autocomplete.js

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

function buildTable(headers, values) {
  const table = [headers, ...values];
  const formattedTable = table
    .map((parts) =>
      parts.map(([part, align], partIndex) =>
        part[{ left: "padEnd", right: "padStart" }[align]](
          Math.max(...table.map((ps) => ps[partIndex][0].length)),
          " ",
        ),
      ),
    )
    .map((parts) => parts.join(" ".repeat(4)));
  const [formattedHeaders, ...formattedValues] = formattedTable;

  return [
    formattedHeaders,
    "-".repeat(formattedHeaders.length),
    ...formattedValues,
  ].join("\n");
}

async function fetchTagAssociations(inputTagNames: string[]): Promise<Tag[]> {
  const inputTags = inputTagNames.map((n) => ({
    name: n,
    images: autocompleter.findOne(n).imageCount,
  }));
  let sampleSize = 300;
  const images = await booru.searchImages({
    query: [
      "score.gte:50",
      "first_seen_at.lt:3 days ago",
      `(${inputTags.map((t) => t.name).join(" || ")})`,
    ].join(", "),
    // sort: `random:${Date.now()}`,
    sort: "_score", // TODO
    limit: sampleSize,
  });
  sampleSize = images.length;

  const sampleImageTags = Array.from(
    new Set(images.flatMap((image) => image.tags)),
  )
    .map((name) => autocompleter.findOne(name))
    .filter(Boolean)
    .map((tag) => {
      const object = {
        name: tag.name,
        totalImageCount: tag.imageCount,
        sampleImageCount: images.filter((image) =>
          image.tags.includes(tag.name),
        ).length,
        overlaps: {},
      };

      object.overlaps = Object.fromEntries(
        inputTags.map((inputTag) => [
          inputTag.name,
          object.sampleImageCount / Math.min(inputTag.images, sampleSize),
        ]),
      );

      return object;
    });

  console.log();
  console.log(
    buildTable(
      [
        ["Tag", "left"],
        ["Total Images", "right"],
        ["Sample Images", "right"],
        ...inputTags.map((inputTag) => [`Overlap- ${inputTag.name}`, "right"]),
      ],
      sampleImageTags
        .sort((a, b) => b.sampleImageCount - a.sampleImageCount)
        .slice(0, 25)
        .map((t) => [
          [t.name, "left"],
          [t.totalImageCount.toLocaleString("en-US"), "right"],
          [t.sampleImageCount.toLocaleString("en-US"), "right"],
          ...Object.entries(t.overlaps).map(([name, overlap]) => [
            `${overlap.toLocaleString("en-US", { style: "percent" })}`,
            "right",
          ]),
        ]),
    ),
  );
  console.log();

  console.log(
    sampleImageTags
      .sort((a, b) => b.sampleImageCount - a.sampleImageCount)
      .slice(0, 25),
  );

  const imageTags: Tag[] = Array.from(
    new Set(images.flatMap((image) => image.tags)),
  )
    .map((name) => autocompleter.findOne(name))
    .filter(Boolean)
    .map(
      (r) =>
        ({
          name: r.name,
          images: r.imageCount,
        }) as Tag,
    );
  const counts = images
    .flatMap((image) => image.tags)
    .reduce(
      (acc, tag) => {
        acc[tag] = (acc[tag] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

  console.log("Considering tag:", inputTags);
  console.log("Top counts:");
  console.log(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([name, count]) => `- ${name}: ${count}`)
      .join("\n"),
  );
  return (
    imageTags
      .filter((t) =>
        // t.images > inputTags.images &&
        // counts[t.name] / Math.min(inputTags.images, sampleSize) > 0.5
        inputTags.every(
          (inputTag) =>
            // t.images < inputTag.images &&
            t.name !== inputTag.name &&
            counts[t.name] / Math.min(inputTag.images, sampleSize) > 0.4,
        ),
      )
      // .sort((a, b) => counts[b.name] - counts[a.name])
      .sort((a, b) => {
        const func: (i: Tag) => number = (i) =>
          inputTags.reduce(
            (acc, inputTag) =>
              acc + counts[i.name] / Math.min(inputTag.images, sampleSize),
            0,
          );

        return func(b) - func(a);
      })
      .slice(0, 15)
  );
}

const associations = await fetchTagAssociations([
  ..."rarity, pony, unicorn, cute, female, floppy ears, frog (hoof), high res, horn, looking at you, mare, open mouth, raribetes, simple background, solo, underhoof".split(
    ", ",
  ),
]);

console.log(associations);
console.log(
  associations.map((tag) => `- ${tag.name} (${tag.images})`).join("\n"),
);
