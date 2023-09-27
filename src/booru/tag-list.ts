import chalk from "chalk";
import Booru from "./index.js";
import { Tag, TagName, TagSlug } from "./types.js";

export default class TagList {
  private readonly objects: Map<TagSlug, Tag>;

  constructor(private readonly booru: Booru) {
    this.objects = new Map<TagSlug, Tag>();
  }

  get names() {
    return Array.from(this.objects.values()).map((object) => object.name);
  }

  add(object: Tag) {
    this.objects.set(object.slug, object);
  }

  async addByName(name: TagName) {
    const object = await this.booru.fetchTagByName(name);

    if (object) {
      this.add(object);
    }
  }

  remove(slug: TagSlug) {
    this.objects.delete(slug);
  }

  async removeByName(name: TagName) {
    const object = await this.booru.fetchTagByName(name);

    if (object) {
      this.remove(object.slug);
    }
  }

  async has(slug: TagSlug): Promise<boolean> {
    if (this.objects.has(slug)) {
      return true;
    }

    for (const object of this.objects.values()) {
      if (object.aliased_tag === slug || object.aliases.includes(slug)) {
        return true;
      }
    }

    return false;
  }

  async printOne(object: Tag, depth: number = 0) {
    let text = "";

    if (object.aliased_tag) {
      const aliasedSlug = object.aliased_tag;
      const aliasedObject = await this.booru.fetchTagBySlug(aliasedSlug);

      if (aliasedObject) {
        text += chalk.yellow(object.name);
        text += chalk.grey(" aliases to ") + chalk.green(aliasedObject.name);
        object = aliasedObject;
      }
    } else {
      text += chalk.green(object.name);
    }

    if (object.implied_tags.length) {
      const impliedObjects = (
        await Promise.all(
          object.implied_tags.map((impliedSlug) =>
            this.booru.fetchTagBySlug(impliedSlug),
          ),
        )
      ).filter((impliedObject): impliedObject is Tag => Boolean(impliedObject));

      if (impliedObjects.length) {
        const implies =
          chalk.grey(" implies ") +
          impliedObjects
            .map((impliedObject) => chalk.magenta(impliedObject.name))
            .join(chalk.grey(", "));

        text += depth > 0 ? chalk.dim(implies) : implies;
      }
    }

    console.log(
      " ".repeat(4).repeat(depth) +
        "• " +
        (depth > 0 && (await this.has(object.slug))
          ? chalk.strikethrough(text)
          : text),
    );

    if (depth < 1) {
      for (const impliedSlug of object.implied_tags) {
        const impliedObject = await this.booru.fetchTagBySlug(impliedSlug);

        if (impliedObject) {
          await this.printOne(impliedObject, depth + 1);
        }
      }
    }
  }

  async printAll() {
    for (const object of this.objects.values()) {
      await this.printOne(object);
    }
  }
}
