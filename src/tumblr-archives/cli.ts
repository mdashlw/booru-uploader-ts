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

if (command === "archive") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      blogs: {
        type: "string",
        multiple: true,
      },
    },
  });

  if (!args.blogs?.length) {
    console.error("Invalid usage: missing at least one --blogs <blog name>");
    process.exit(1);
  }

  for (const blogName of args.blogs) {
    try {
      console.log(`Starting to archive blog ${blogName}`);
      await archivePosts(blogName);
      console.log(`Finished archiving blog ${blogName}`);
    } catch (error) {
      console.error(`Failed to archive blog ${blogName}`, error);
    }
  }
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
