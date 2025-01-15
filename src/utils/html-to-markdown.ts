import TurndownService, { type Node } from "turndown";
import type { MarkdownDialect } from "../booru/types.ts";
import { escapeMarkdownWithWhitespace } from "./markdown.ts";

function cleanAttribute(attribute: string | null) {
  return attribute?.replaceAll(/(\n+\s*)+/g, "\n") ?? "";
}

export function convertHtmlToMarkdown(html: string, markdown: MarkdownDialect) {
  const turndownService = new TurndownService({
    emDelimiter: markdown.italicStart as any,
    strongDelimiter: markdown.boldStart as any,
    defaultReplacement: (content, node) =>
      node.isBlock ? "\n" + content.trim() + "\n" : content,
  });

  turndownService.escape = (str) => escapeMarkdownWithWhitespace(str, markdown);

  turndownService.addRule("code", {
    filter: ["code"],
    replacement: (content) => content,
  });

  function anyParentMatch(node: Node, filter: (node: Node) => boolean) {
    let parent: Node | null = node.parentNode;

    while (parent) {
      if (filter(parent)) {
        return true;
      }

      parent = parent.parentNode;
    }

    return false;
  }

  turndownService.addRule("emphasis", {
    filter: ["em", "i"],
    replacement: (content, node, options) => {
      content = content.trim();

      if (!content) {
        return "";
      }

      if (
        anyParentMatch(node, (n) => n.nodeName === "EM" || n.nodeName === "I")
      ) {
        return content;
      }

      return options.emDelimiter + content + options.emDelimiter;
    },
  });

  turndownService.addRule("strong", {
    filter: ["strong", "b"],
    replacement: (content, node, options) => {
      content = content.trim();

      if (!content) {
        return "";
      }

      if (
        anyParentMatch(
          node,
          (n) => n.nodeName === "STRONG" || n.nodeName === "B",
        )
      ) {
        return content;
      }

      return options.strongDelimiter + content + options.strongDelimiter;
    },
  });

  turndownService.addRule("custom_image", {
    filter: "img",
    replacement: (_content, node) => {
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

  return turndownService.turndown(html).trim();
}
