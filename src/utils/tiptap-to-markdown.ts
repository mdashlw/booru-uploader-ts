// @ts-nocheck

function escapeMarkdown(text: string) {
  return (
    text
      .replaceAll("*", "\\*") // bold/italics
      // .replaceAll("_", "\\_") // underline
      .replaceAll(/\B_(.+)_\B/g, `\\_$1\\_`) // underline
      .replaceAll("||", "\\|\\|") // spoiler
      .replaceAll("`", "\\`") // code
      .replaceAll("~", "\\~") // strikethrough
      .replaceAll("^", "\\^") // superscript
      .replaceAll("%", "\\%") // subscript
      .replaceAll("#", "\\#") // headings
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll(/^(\s*)-/gm, "$1\\-")
      .replaceAll(/^(\s*)>(\s+)/gm, "$1\\>$2")
      .replaceAll(/^(\s*)\+/gm, "$1\\+")
      .replaceAll(/(\d+)\.(\s+)/g, "$1\\.$2")
  );
}

function applyFormatting(
  text: string,
  formatting: (content: string) => string,
) {
  return text.replace(
    /^(\s*)(.+?)(\s*)$/gm,
    (_, leading, content, trailing) =>
      `${leading}${formatting(content)}${trailing}`,
  );
}

const processors = {
  doc: (node: any) => node.content.map(process).join("\n"),
  heading: (node: any) =>
    `${"#".repeat(node.attrs.level)} ${node.content.map(process).join("")}`,
  paragraph: (node: any) => node.content?.map(process).join("") ?? "",
  text: (node: any) => {
    let text = escapeMarkdown(node.text);

    if (node.marks) {
      const markSortNumbers = {
        link: 1,
      };

      for (const mark of node.marks.sort(
        (a, b) =>
          (markSortNumbers[a.type] ?? 0) - (markSortNumbers[b.type] ?? 0),
      )) {
        if (mark.type === "bold") {
          text = applyFormatting(text, (content) => `**${content}**`);
        } else if (mark.type === "italic") {
          text = applyFormatting(text, (content) => `*${content}*`);
        } else if (mark.type === "underline") {
          text = applyFormatting(text, (content) => `__${content}__`);
        } else if (mark.type === "strike") {
          text = applyFormatting(text, (content) => `~~${content}~~`);
        } else if (mark.type === "link") {
          let link = mark.attrs.href;

          if (link.startsWith("https://www.deviantart.com/users/outgoing?")) {
            link = link.substring(link.indexOf("?") + 1);
          }

          text = applyFormatting(text, (content) => `[${content}](${link})`);
        }
      }
    }

    return text;
  },
  orderedList: (node: any) =>
    node.content
      .map((c, i) => `${node.attrs.start + i}. ${process(c)}`)
      .join("\n"),
  hardBreak: () => "\n",
  listItem: (node: any) => node.content.map(process).join("\n"),
  bulletList: (node: any) =>
    node.content.map((c) => `- ${process(c)}`).join("\n"),
  blockquote: (node: any) =>
    node.content.map((c) => `> ${process(c)}`).join("\n"),
  "da-deviation": (node: any) => {
    const width = node.attrs.width;
    const deviation = node.attrs.deviation;
    const closestMedia = deviation.media.types
      .sort((a, b) => a.w - b.w)
      .find((o) => o.w >= width);

    let mediaUrl = deviation.media.baseUri;

    if (closestMedia.c) {
      mediaUrl += closestMedia.c.replace(
        "<prettyName>",
        deviation.media.prettyName,
      );
    }

    if (closestMedia.r >= 0) {
      mediaUrl += `?token=${deviation.media.token[closestMedia.r]}`;
    }

    return `[![${deviation.title}](${mediaUrl})](${deviation.url} "${deviation.title} by ${deviation.author.username}")`;
  },
  "da-emote": (node: any) =>
    `![${node.attrs["data-emote"]}](${node.attrs.src} "${node.attrs["data-emote"]}")`,
  "da-mention": (node: any) =>
    `[@${node.attrs.user.username}](https://www.deviantart.com/${node.attrs.user.username.toLowerCase()})`,
  horizontalRule: () => "* * *",
  anchor: () => "",
};

function process(node: any) {
  const processor = processors[node.type];

  if (!processor) {
    throw new Error(`Unsupported node type: ${node.type}`);
  }

  return processor(node);
}

export default function convertTipTapToMarkdown(doc: any) {
  if (doc.version !== "1" && doc.version !== 1) {
    throw new Error(`Unsupported document version: ${doc.version}`);
  }

  if (doc.document.type !== "doc") {
    throw new Error("Root document must be a doc");
  }

  return process(doc.document);
}
