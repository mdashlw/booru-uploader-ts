import TurndownService from "turndown";
import type { MarkdownDialect } from "../booru/types.ts";
import { escapeMarkdownWithWhitespace } from "./markdown.ts";

const MAGIC_NEW_LINE = "\0";

function cleanAttribute(attribute: string | null) {
  return attribute?.replaceAll(/(\n+\s*)+/g, "\n") ?? "";
}

export function convertHtmlToMarkdown(html: string, markdown: MarkdownDialect) {
  const turndownService = new TurndownService({
    emDelimiter: markdown.italicStart as any,
    strongDelimiter: markdown.boldStart as any,
    blankReplacement: function (content, node) {
      console.log(`[blankReplacement]`, {
        tagName: node._tagName,
        isBlock: node.isBlock,
        content,
      });
      return node.isBlock ? "\n\n" : "";
    },
    keepReplacement: function (content, node) {
      console.log(`[keepReplacement]`, {
        tagName: node._tagName,
        isBlock: node.isBlock,
        content,
      });
      return node.isBlock ? "\n\n" + node.outerHTML + "\n\n" : node.outerHTML;
    },
    defaultReplacement: function (content, node) {
      console.log(`[defaultReplacement]`, {
        tagName: node._tagName,
        isBlock: node.isBlock,
        content,
      });
      return node.isBlock
        ? content.replaceAll(MAGIC_NEW_LINE, "\n").trim() + MAGIC_NEW_LINE
        : content;
    },
  });

  turndownService.escape = (str) => escapeMarkdownWithWhitespace(str, markdown);

  turndownService.addRule("custom_image", {
    filter: "img",
    replacement: (content, node) => {
      const src: string | null = node.getAttribute("src");

      if (!src) {
        return "";
      }

      return markdown.inlineImage(
        cleanAttribute(node.getAttribute("alt")),
        src,
        cleanAttribute(node.getAttribute("title")),
      );
    },
  });

  turndownService.addRule("custom_inlineLink", {
    filter: (node, options) =>
      options.linkStyle === "inlined" &&
      node.nodeName === "A" &&
      node.getAttribute("href"),
    replacement: (content, node) => {
      if (!content.trim()) {
        return "";
      }

      let href: string | null = node.getAttribute("href");

      if (!href) {
        return "";
      }

      const deviantartOutgoingPrefix =
        "https://www.deviantart.com/users/outgoing?";
      if (href.startsWith(deviantartOutgoingPrefix)) {
        href = href.substring(deviantartOutgoingPrefix.length);
      }

      if (
        href.startsWith("https://t.umblr.com/redirect") ||
        href.startsWith("http://t.umblr.com/redirect")
      ) {
        href = new URL(href).searchParams.get("z")!;
      }

      if (
        (content.endsWith("…") &&
          href
            .substring(href.indexOf("//") + 2)
            .startsWith(content.replaceAll("\\", "").slice(0, -1))) ||
        node.classList.contains("auto_link_shortened")
      ) {
        if (markdown.inlineAllLinks) {
          return markdown.inlineLink(href, href);
        } else {
          return href;
        }
      }

      return markdown.inlineLink(
        content,
        href,
        cleanAttribute(node.getAttribute("title")),
      );
    },
  });

  return turndownService.turndown(html).replaceAll(MAGIC_NEW_LINE, "\n").trim();
}
