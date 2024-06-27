import Bluebird from "bluebird";
import fs from "node:fs";
import process from "node:process";
import util from "node:util";
import { archivePosts, getReblogs } from "./index.js";

util.inspect.defaultOptions.depth = null;

const [, , command] = process.argv;

if (!command) {
  console.error("Usage:");
  console.error(
    "- cli.ts archive --blogs <blog name> [--blogs <blog name>]...",
  );
  console.error("- cli.ts reblogs --post <post id>");
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  console.error(reason);
});

if (command === "archive") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      blogs: {
        type: "string",
        multiple: true,
      },
      blogsFromFile: {
        type: "string",
      },
      concurrency: {
        type: "string",
      },
    },
  });

  if (!args.blogs?.length && !args.blogsFromFile) {
    console.error("Invalid usage: missing at least one --blogs <blog name>");
    process.exit(1);
  }

  const blogs = args.blogsFromFile
    ? (await fs.promises.readFile(args.blogsFromFile, "utf8"))
        .split("\n")
        .filter(Boolean)
    : (args.blogs as string[]);

  const concurrency = args.concurrency ? Number(args.concurrency) : 1;

  if (Number.isNaN(concurrency)) {
    console.error("Invalid concurrency");
    process.exit(1);
  }

  await Bluebird.map(
    blogs,
    async (blogName) => {
      try {
        console.log(`Starting to archive blog ${blogName}`);
        await archivePosts(blogName);
        console.log(`Finished archiving blog ${blogName}`);
      } catch (error) {
        console.error(`Failed to archive blog ${blogName}`, error);
      }
    },
    { concurrency },
  );
} else if (command === "reblogs") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      post: {
        type: "string",
      },
    },
  });

  if (!args.post) {
    console.error("Invalid usage: missing --post <post id>");
    process.exit(1);
  }

  const postId = args.post.split("/").find((s) => /^\d+$/.test(s));

  if (!postId) {
    console.error("Invalid post id");
    process.exit(1);
  }

  const reblogs = await getReblogs(postId);

  if (reblogs) {
    for (const reblog of reblogs) {
      console.log(
        `Post ${reblog.rootPostId} by ${reblog.rootBlogName} reblogged at https://www.tumblr.com/${reblog.reblogBlogName}/${reblog.reblogPostId}`,
      );
    }
  } else {
    console.log("No reblogs");
  }
} else {
  console.error("Unknown command");
  process.exit(1);
}
