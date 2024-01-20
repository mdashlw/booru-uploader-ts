import Booru from "../booru/index.js";
import { Blob } from "node:buffer";
import { FormData } from "undici";
import { AutocompletedTag, Image, MarkdownDialect } from "../booru/types.js";

export default class Manebooru extends Booru {
  constructor(options?: { key?: string }) {
    super("Manebooru", new URL("https://manebooru.art"), {
      ...options,
      supportsMultipleSources: false,
    });
  }

  get markdown(): MarkdownDialect {
    return {
      bold: (text) => `*${text}*`,
      blockQuote: (text) => `[bq]${text}[/bq]`,
      escape: (text) => `[==${text}==]`,
      boldStart: "*",
      boldEnd: "*",
      italicStart: "_",
      italicEnd: "_",
      strikethroughStart: "-",
      strikethroughEnd: "-",
      smallStart: "~",
      smallEnd: "~",
      inlineAllLinks: true,
      inlineLinkStart: '"',
      inlineLinkEnd: (url) => `":${url}`,
      headingStart: () => "",
      blockQuoteStart: "[bq]",
      blockQuoteEnd: "[/bq]",
      inlineLink: (text, destination) => `"${text}":${destination}`,
      inlineImage(_description, destination) {
        return `!${destination}!`;
      },
    };
  }

  async autocompleteTags(term: string): Promise<AutocompletedTag[]> {
    return await this.fetch<AutocompletedTag[]>({
      method: "GET",
      path: "/tags/autocomplete",
      query: {
        term,
      },
    });
  }

  async postImage({
    blob,
    tags,
    sourceUrl,
    description,
  }: {
    blob: Blob;
    tags: string[];
    sourceUrl?: string;
    description?: string;
  }): Promise<Image> {
    const formData = new FormData();

    formData.append("image[image]", blob);
    formData.append("image[tag_input]", tags.join(", "));

    if (sourceUrl) {
      formData.append("image[source_url]", sourceUrl);
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
    }).then((data) => data.image);
  }
}
