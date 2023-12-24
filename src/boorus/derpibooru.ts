import Booru from "../booru/index.js";
import { Blob } from "node:buffer";
import { FormData } from "undici";
import { AutocompletedTag, Image } from "../booru/types.js";

export default class Derpibooru extends Booru {
  constructor(options?: { key?: string }) {
    super("Derpibooru", new URL("https://derpibooru.org"), {
      ...options,
      supportsMultipleSources: true,
    });
  }

  get markdown() {
    return {
      bold: (text: string): string => `**${text}**`,
      blockQuote: (text: string): string =>
        text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      inlineLink: (text: string, destination: string): string =>
        `[${text}](${destination})`,
      escape: (text: string): string =>
        text
          .replaceAll("*", "\\*") // bold/italics
          .replaceAll("_", "\\_") // underline
          .replaceAll("|", "\\|") // spoiler
          .replaceAll("`", "\\`") // code
          .replaceAll("~", "\\~") // strikethrough
          .replaceAll("^", "\\^") // superscript
          .replaceAll("%", "\\%") // subscript
          .replaceAll("#", "\\#"), // headers
    };
  }

  async autocompleteTags(term: string): Promise<AutocompletedTag[]> {
    return await this.fetch<AutocompletedTag[]>({
      method: "GET",
      path: "/autocomplete/tags",
      query: {
        term,
      },
    });
  }

  async postImage({
    blob,
    tags,
    sourceUrls = [],
    description,
  }: {
    blob: Blob;
    tags: string[];
    sourceUrls?: string[];
    description?: string;
  }): Promise<Image> {
    const formData = new FormData();

    formData.append("image[image]", blob);
    formData.append("image[tag_input]", tags.join(", "));

    for (const [index, url] of sourceUrls.entries()) {
      formData.append(`image[sources][${index}][source]`, url);
    }

    if (description) {
      formData.append("image[description]", description);
    }

    return await this.fetch<{ image: Image }>({
      method: "POST",
      path: "/api/v1/json/images",
      query: {
        key: this.requireKey(),
      },
      body: formData,
      retryOnServerError: false, // Derpibooru's Cloudflare returns 500 even on success
    }).then((data) => data.image);
  }
}
