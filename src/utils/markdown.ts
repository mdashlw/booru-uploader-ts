const escapes: [RegExp, string][] = [
  [/\\/g, "\\$&"],
  [/\*/g, "\\$&"],
  [/-/g, "\\$&"],
  [/\+/g, "\\$&"],
  [/=+/g, "\\$&"],
  [/^#{1,6} /g, "\\$&"],
  [/`/g, "\\$&"],
  [/~/g, "\\$&"],
  [/\^/g, "\\$&"],
  [/%/g, "\\$&"],
  [/\[/g, "\\$&"],
  [/\]/g, "\\$&"],
  [/^>/g, "\\$&"],
  [/_/g, "\\$&"],
  [/\|/g, "\\$&"],
  [/^(\d+)\. /g, "$1\\. "],
];

export function escapeMarkdown(
  markdown: string,
  dialect: "derpibooru" | "manebooru",
) {
  if (dialect === "derpibooru") {
    return escapes.reduce(
      (accumulator, escape) => accumulator.replaceAll(escape[0], escape[1]),
      markdown,
    );
  } else if (dialect === "manebooru") {
    return escapes
      .reduce(
        (accumulator, escape) =>
          accumulator.replaceAll(escape[0], "ESCAPESTART$&ESCAPEEND"),
        markdown,
      )
      .replaceAll("ESCAPESTART", "[==")
      .replaceAll("ESCAPEEND", "==]");
  } else {
    throw new Error(`Unknown dialect: ${dialect}`);
  }
}
