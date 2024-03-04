import process from "node:process";
import util from "node:util";
import { archivePosts } from "./api.js";

const [, , command] = process.argv;

if (!command) {
  console.error("Usage:");
  console.error("- cli.ts archive --blog <blog name>");
  process.exit(1);
}

if (command === "archive") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      blog: {
        type: "string",
      },
    },
  });

  if (!args.blog) {
    console.error("Invalid usage: missing --blog <blog name>");
    process.exit(1);
  }

  await archivePosts(args.blog);
} else {
  console.error("Unknown command");
  process.exit(1);
}
