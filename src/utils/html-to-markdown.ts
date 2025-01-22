import TurndownService, { type Node } from "turndown";
import type { MarkdownDialect } from "../booru/types.ts";
import { escapeMarkdownWithWhitespace } from "./markdown.ts";

const MAGIC_SPACE = "\x01";

function cleanAttribute(attribute: string | null) {
  return attribute?.replaceAll(/(\n+\s*)+/g, "\n") ?? "";
}

function applyFormatting(
  text: string,
  formatting: (content: string) => string,
) {
  if (!text.trim()) {
    return text;
  }

  return text.replace(
    /^([\s\x01]*)(.+?)([\s\x01]*)$/,
    (_, leading, content, trailing) =>
      `${leading}${formatting(content)}${trailing}`,
  );
}

export function convertHtmlToMarkdown(
  html: string,
  markdown: MarkdownDialect,
  baseUrl?: string,
) {
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
      if (!content.trim()) {
        return content;
      }

      if (
        anyParentMatch(node, (n) => n.nodeName === "EM" || n.nodeName === "I")
      ) {
        return content;
      }

      return applyFormatting(
        content,
        (content) => `${options.emDelimiter}${content}${options.emDelimiter}`,
      );
    },
  });

  turndownService.addRule("strong", {
    filter: ["strong", "b"],
    replacement: (content, node, options) => {
      if (!content.trim()) {
        return content;
      }

      if (
        anyParentMatch(
          node,
          (n) => n.nodeName === "STRONG" || n.nodeName === "B",
        )
      ) {
        return content;
      }

      return applyFormatting(
        content,
        (content) =>
          `${options.strongDelimiter}${content}${options.strongDelimiter}`,
      );
    },
  });

  turndownService.addRule("underline", {
    filter: ["u"],
    replacement: (content, node, options) => {
      if (!content.trim()) {
        return content;
      }

      if (anyParentMatch(node, (n) => n.nodeName === "U")) {
        return content;
      }

      return applyFormatting(content, (content) => `__${content}__`);
    },
  });

  turndownService.addRule("custom_image", {
    filter: "img",
    replacement: (_content, node) => {
      let src: string | null = node.getAttribute("src");

      if (!src) {
        return "";
      }

      if (src.startsWith("//")) {
        src = `https:${src}`;
      }

      if (src.startsWith("/") && baseUrl) {
        src = `${baseUrl}${src}`;
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

      href = href.replaceAll("\\", "");

      if (href.startsWith("//")) {
        href = `https:${href}`;
      }

      if (href.startsWith("/") && baseUrl) {
        href = `${baseUrl}${href}`;
      }

      const removePrefixes = [
        "https://href.li/?",
        "https://www.deviantart.com/users/outgoing?",
      ];
      for (const prefix of removePrefixes) {
        if (href.startsWith(prefix)) {
          href = href.substring(prefix.length);
        }
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

  return turndownService
    .turndown(html.replaceAll("&nbsp;", MAGIC_SPACE))
    .trim()
    .replaceAll(MAGIC_SPACE, " ");
}
