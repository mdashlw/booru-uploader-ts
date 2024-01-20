import { MarkdownDialect } from "../booru/types.js";
import { NpfContentBlock, NpfTextBlock } from "./tumblr-npf-types.js";

export default function convertTumblrNpfToMarkdown(
  npf: NpfContentBlock[],
  markdown: MarkdownDialect,
) {
  return npf
    .filter((block): block is NpfTextBlock => block.type === "text")
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

        if (formattings.length) {
          text += "\u200b";
        }

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
              text += markdown.inlineLinkStart;
              break;
          }
        }

        text += markdown.escape(block.text.substring(start, end));

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