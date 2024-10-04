import chalk from "chalk";
import Booru from "./index.ts";
import TagList from "./tag-list.ts";
import type { TagName } from "./types.ts";

export default class TagLists {
  private readonly tagLists: Map<Booru, TagList>;

  constructor(public boorus: Booru[]) {
    this.tagLists = new Map(boorus.map((booru) => [booru, new TagList(booru)]));
  }

  getList(booru: Booru): TagList | null {
    return this.tagLists.get(booru) ?? null;
  }

  async addByName(name: TagName) {
    await Promise.all(
      Array.from(this.tagLists.values()).map((tagList) =>
        tagList.addByName(name),
      ),
    );
  }

  async removeByName(name: TagName) {
    await Promise.all(
      Array.from(this.tagLists.values()).map((tagList) =>
        tagList.removeByName(name),
      ),
    );
  }

  async printAll() {
    for (const [booru, tagList] of this.tagLists.entries()) {
      console.log(chalk.bold.underline(booru.name));
      await tagList.printAll();
      console.log();
    }
  }
}
