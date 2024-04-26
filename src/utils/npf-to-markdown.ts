import { MarkdownDialect } from "../booru/types.js";
import { escapeMarkdownWithWhitespace } from "./markdown.js";
import { NpfContentBlock } from "./tumblr-npf-types.js";

export default function convertTumblrNpfToMarkdown(
  npf: NpfContentBlock[],
  markdown: MarkdownDialect,
) {
  return npf
    .filter((block) => block.type === "text")
    .map((block) => {
      if (!block.formatting) {
        if (!block.text.trim()) {
          return block.text;
        }

        return markdown.escape(block.text);
      }

      const indexes = [0, block.text.length];

      // Get all indexes where formatting changes
      for (const f of block.formatting) {
        if (!indexes.includes(f.start)) {
          indexes.push(f.start);
        }
        if (!indexes.includes(f.end)) {
          indexes.push(f.end);
        }
      }

      indexes.sort((a, b) => a - b);

      let text = "";

      for (let i = 1; i < indexes.length; i++) {
        const start = indexes[i - 1];
        const end = indexes[i];
        const formattings = block.formatting.filter(
          (f) => f.start <= start && f.end >= end,
        );

        const chunk = block.text.substring(start, end);

        if (!chunk.trim()) {
          formattings.length = 0;
        }

        if (formattings.length) {
          text += "\u200b";
        }

        formattings.sort(
          (a, b) => Number(b.type === "link") - Number(a.type === "link"),
        );

        for (const formatting of formattings) {
          switch (formatting.type) {
            case "bold":
              text += markdown.boldStart;
              break;
            case "italic":
              text += markdown.italicStart;
              break;
            case "strikethrough":
              text += markdown.strikethroughStart;
              break;
            case "small":
              text += markdown.smallStart;
              break;
            case "link":
              if (formatting.url.includes("://t.umblr.com/redirect")) {
                // formatting.url = chunk;

                formatting.url = new URL(formatting.url).searchParams.get("z")!;
              }

              if (formatting.url === chunk && !markdown.inlineAllLinks) {
                continue;
              }

              text += markdown.inlineLinkStart;
              break;
          }
        }

        text += escapeMarkdownWithWhitespace(chunk, markdown);

        for (const formatting of formattings.reverse()) {
          switch (formatting.type) {
            case "bold":
              text += markdown.boldEnd;
              break;
            case "italic":
              text += markdown.italicEnd;
              break;
            case "strikethrough":
              text += markdown.strikethroughEnd;
              break;
            case "small":
              text += markdown.smallEnd;
              break;
            case "link":
              if (formatting.url === chunk && !markdown.inlineAllLinks) {
                continue;
              }

              text += markdown.inlineLinkEnd(formatting.url);
              break;
          }
        }
      }

      switch (block.subtype) {
        case "heading1":
          text = markdown.headingStart(1) + text;
          break;
        case "heading2":
          text = markdown.headingStart(2) + text;
          break;
        case "quote":
          text = markdown.blockQuoteStart + text + markdown.blockQuoteEnd;
          break;
      }

      return text;
    })
    .join("\n");
}
