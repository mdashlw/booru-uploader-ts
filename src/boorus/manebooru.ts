import Booru from "../booru/index.js";
import { Blob } from "node:buffer";
import { FormData } from "undici";
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
