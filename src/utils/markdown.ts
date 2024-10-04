import type { MarkdownDialect } from "../booru/types.ts";

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
