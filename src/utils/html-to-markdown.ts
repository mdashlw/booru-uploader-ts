import TurndownService from "turndown";
import { escapeMarkdown } from "./markdown.js";

function cleanAttribute(attribute: string | null) {
  return attribute?.replaceAll(/(\n+\s*)+/g, "\n") ?? "";
}

export function convertHtmlToMarkdown(
  html: string,
  dialect: "derpibooru" | "manebooru",
) {
  const turndownService = new TurndownService({
    emDelimiter: (
      {
        derpibooru: "*",
        manebooru: "_",
      } as const
    )[dialect] as any,
    strongDelimiter: (
      {
        derpibooru: "**",
        manebooru: "*",
      } as const
    )[dialect] as any,
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

  turndownService.escape = (markdown) => escapeMarkdown(markdown, dialect);

  turndownService.addRule("custom_image", {
    filter: "img",
    replacement: (content, node) => {
      const src: string | null = node.getAttribute("src");

      if (!src) {
        return "";
      }

      if (dialect === "derpibooru") {
        const alt = cleanAttribute(node.getAttribute("alt"));
        const title = cleanAttribute(node.getAttribute("title"));
        const titlePart = title ? ` "${title}"` : "";

        return src ? `![${alt}](${src}${titlePart})` : "";
      } else if (dialect === "manebooru") {
        return `!${src}!`;
      } else {
        throw new Error(`Unknown dialect: ${dialect}`);
      }
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
        if (dialect === "manebooru") {
          return `"${href}":${href}`;
        } else {
          return href;
        }
      }

      if (dialect === "derpibooru") {
        let title = cleanAttribute(node.getAttribute("title"));

        if (title) {
          title = ` "${title}"`;
        }

        return `[${content}](${href}${title})`;
      } else if (dialect === "manebooru") {
        return `"${content}":${href}`;
      } else {
        throw new Error(`Unknown dialect: ${dialect}`);
      }
    },
  });

  const markdown = turndownService.turndown(html);

  return markdown;
}
