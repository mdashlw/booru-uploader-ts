import type { MarkdownDialect } from "../booru/types.ts";
import {
  NpfContentBlock,
  NpfLayoutBlock,
  NpfTextBlock,
} from "./tumblr-types.ts";

function formatTextBlock(block: NpfTextBlock, markdown: MarkdownDialect) {
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

    text += chunk.substring(0, chunk.length - chunk.trimStart().length);

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

    text += markdown.escape(chunk.trim());

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

    text += chunk.substring(chunk.trimEnd().length);
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
}

export default function convertTumblrNpfToMarkdown(
  content: NpfContentBlock[],
  layout: NpfLayoutBlock[],
  markdown: MarkdownDialect,
) {
  let orderedContent: NpfContentBlock[];

  if (layout.filter((block) => block.type === "rows").length > 1) {
    throw new Error("too many rows layout blocks");
  }

  const rows = layout.find((block) => block.type === "rows");
  const ask = layout.find((block) => block.type === "ask");

  if (rows) {
    orderedContent = [];

    for (const { blocks } of rows.display) {
      for (const blockId of blocks) {
        orderedContent.push(content[blockId]);
      }
    }

    if (orderedContent.length !== content.length) {
      throw new Error("rows layout block is missing some content blocks");
    }
  } else {
    orderedContent = content;
  }

  return orderedContent
    .filter((block) => block.type === "text")
    .map((block) => {
      const originalBlockIndex = content.indexOf(block);
      let text = formatTextBlock(block, markdown);

      if (ask?.blocks.includes(originalBlockIndex)) {
        const who = ask.attribution?.blog.name ?? "Anonymous";
        const attr = `${markdown.italicStart}${markdown.bold(who)} asked:${markdown.italicEnd}`;
        text = `${attr}\n${text}`;
        return markdown.blockQuote(text);
      }

      return text;
    })
    .join("\n");
}
