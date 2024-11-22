import { Blob } from "node:buffer";
import { FormData } from "undici";
import Booru from "../booru/index.ts";
import type {
  AutocompletedTag,
  Image,
  MarkdownDialect,
} from "../booru/types.ts";

export default class Derpibooru extends Booru {
  constructor(options?: { key?: string }) {
    super("Derpibooru", new URL("https://derpibooru.org"), {
      ...options,
      supportsMultipleSources: true,
    });
  }

  get markdown(): MarkdownDialect {
    return {
      bold: (text) => `**${text}**`,
      blockQuote: (text) =>
        text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      escape: (text) =>
        text
          .replaceAll("*", "\\*") // bold/italics
          .replaceAll("_", "\\_") // underline
          .replaceAll("||", "\\|\\|") // spoiler
          .replaceAll("`", "\\`") // code
          .replaceAll("~", "\\~") // strikethrough
          .replaceAll("^", "\\^") // superscript
          .replaceAll("%", "\\%") // subscript
          .replaceAll("#", "\\#") // headings
          .replaceAll("=", "\\=")
          .replaceAll("[", "\\[")
          .replaceAll("]", "\\]")
          .replaceAll("-", "\\-")
          .replaceAll(">", "\\>")
          .replaceAll(/^(\d+)\. /g, "$1\\. ")
          .replaceAll("+", "\\+"),
      boldStart: "**",
      boldEnd: "**",
      italicStart: "*",
      italicEnd: "*",
      strikethroughStart: "~~",
      strikethroughEnd: "~~",
      smallStart: "%",
      smallEnd: "%",
      inlineAllLinks: false,
      inlineLinkStart: "[",
      inlineLinkEnd: (url) => `](${url})`,
      headingStart: (n) => `${"#".repeat(n)} `,
      blockQuoteStart: "> ",
      blockQuoteEnd: "",
      inlineLink: (text, destination, title) => {
        const titlePart = title ? ` "${title}"` : "";

        return `[${text}](${destination}${titlePart})`;
      },
      inlineImage(description, destination, title) {
        const titlePart = title ? ` "${title}"` : "";

        return `![${description}](${destination}${titlePart})`;
      },
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
    filename,
    tags,
    sourceUrls = [],
    description,
  }: {
    blob: Blob;
    filename: string | undefined;
    tags: string[];
    sourceUrls?: string[];
    description?: string;
  }): Promise<Image> {
    const formData = new FormData();

    formData.append("image[image]", blob, filename);
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
