import chalk from "chalk";
import { fetchTagsBySlugs } from "./fetch.js";
import { convertTagSlugToName, Tag } from "./index.js";

function hasTag(tags: Tag[], slug: string): boolean {
  return tags.some((tag) => tag.slug === slug || tag.aliased_tag === slug);
}

function printTag(tags: Tag[], tag: Tag, depth: number = 0) {
  let text = "";

  if (tag.aliased_tag) {
    text += chalk.yellow(tag.name);
    tag = tag.resolvedAliasedTag!;
    text += chalk.grey(" aliases to ") + chalk.green(tag.name);
  } else {
    text += chalk.green(tag.name);
  }

  if (tag.implied_tags.length) {
    const implies =
      chalk.grey(" implies ") +
      tag.implied_tags
        .map((slug) => chalk.magenta(convertTagSlugToName(slug)))
        .join(chalk.grey(", "));

    text += depth > 0 ? chalk.dim(implies) : implies;
  }

  console.log(
    " ".repeat(4).repeat(depth) +
      "• " +
      (depth > 0 && hasTag(tags, tag.slug) ? chalk.strikethrough(text) : text),
  );

  if (depth < 1) {
    if (tag.implied_tags.length) {
      for (const impliedTag of tag.resolvedImpliedTags!) {
        printTag(tags, impliedTag, depth + 1);
      }
    }
  }
}

export async function printTags(tags: Tag[]) {
  const aliases: string[] = [];
  const implications: string[] = [];

  for (const tag of tags) {
    if (tag.aliased_tag !== null) {
      aliases.push(tag.aliased_tag);
    } else {
      implications.push(...tag.implied_tags);
    }
  }

  let resolvedTags: Tag[] | undefined;

  if (aliases.length || implications.length) {
    resolvedTags = await fetchTagsBySlugs([...aliases, ...implications]);
  }

  if (aliases.length) {
    const aliasedImplications = aliases
      .map((slug) => resolvedTags!.find((tag) => tag.slug === slug)!)
      .flatMap((tag) => tag.implied_tags);

    if (aliasedImplications.length) {
      resolvedTags!.push(...(await fetchTagsBySlugs(aliasedImplications)));
    }
  }

  for (const tag of tags) {
    let resolvedAliasedTag = tag;

    if (tag.aliased_tag !== null) {
      tag.resolvedAliasedTag = resolvedAliasedTag = resolvedTags?.find(
        (resolvedAlias) => resolvedAlias.slug === tag.aliased_tag,
      )!;
    }

    resolvedAliasedTag.resolvedImpliedTags =
      resolvedAliasedTag.implied_tags.map(
        (slug) =>
          resolvedTags!.find((resolvedTag) => resolvedTag.slug === slug)!,
      );

    printTag(tags, tag);
  }
}
