import TurndownService from "turndown";
import { MarkdownDialect } from "../booru/types.js";
import { escapeMarkdownWithWhitespace } from "./markdown.js";

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
      return node.isBlock ? "\n" + content.trim() + "\n" : content;
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
        content.endsWith("…") &&
        href.substring(href.indexOf("//") + 2).startsWith(content.slice(0, -1))
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

  return turndownService.turndown(html);
}
