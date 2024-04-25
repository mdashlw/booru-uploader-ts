import { MarkdownDialect } from "../booru/types.js";

export function escapeMarkdownWithWhitespace(
  text: string,
  markdown: MarkdownDialect,
) {
  return text.trim()
    ? text.replace(
        /^(\s*)(.+?)(\s*)$/,
        (_, l, s, t) => l + markdown.escape(s) + t,
      )
    : text;
}
