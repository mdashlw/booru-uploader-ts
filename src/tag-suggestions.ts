import { Tag } from "../lib/booru.js";
import Booru from "./booru/index.js";

export default async function suggestTags(
  booru: Booru,
  tags: Tag[],
): Promise<Tag[]> {
  // TODO: to handle aliases this should accept TagList
  // TODO: hence TagList should be moved somewhere, maybe /lib?
  for (const tag of tags) {
    for (const impliedBySlug of tag.implied_by_tags) {
      const impliedByObject = await booru.fetchTagBySlug(impliedBySlug);

      if (impliedByObject?.implied_tags.every((slug) => tags.includes(slug))) {
      }
    }
  }

  return [];
}
