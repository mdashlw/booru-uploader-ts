import Booru from "../booru/index.js";
import { AutocompletedTag, Image } from "../booru/types.js";

export default class Manebooru extends Booru {
  constructor(options?: { key?: string }) {
    super("Manebooru", new URL("https://manebooru.art"), {
      ...options,
      supportsMultipleSources: false,
    });
  }

  get markdown() {
    return {
      bold: (text: string): string => `*${text}*`,
      blockQuote: (text: string): string => `[bq]${text}[/bq]`,
      inlineLink: (text: string, destination: string): string =>
        `"${text}":${destination}`,
      escape: (text: string): string => `[==${text}==]`,
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
    imageUrl,
    tags,
    sourceUrl,
    description,
  }: {
    imageUrl: string;
    tags: string[];
    sourceUrl?: string;
    description?: string;
  }): Promise<Image> {
    return await this.fetch<{ image: Image }>({
      method: "POST",
      path: "/api/v1/json/images",
      query: {
        key: this.requireKey(),
      },
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
        image: {
          tag_input: tags.join(", "),
          source_url: sourceUrl,
          description,
        },
      }),
    }).then((data) => data.image);
  }
}
