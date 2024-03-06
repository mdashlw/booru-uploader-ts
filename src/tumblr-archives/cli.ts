import process from "node:process";
import util from "node:util";
import { archivePosts, getAllReblogs, getReblogs } from "./api.js";

const [, , command] = process.argv;

if (!command) {
  console.error("Usage:");
  console.error("- cli.ts archive --blog <blog name>");
  console.error("- cli.ts reblogs --post <post id>");
  console.error("- cli.ts view --blog <blog name>");
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
        `Post ${reblog.rebloggedRootId} by ${reblog.rebloggedRootName} at ${reblog.rebloggedRootUrl} reblogged by ${reblog.blogName} at ${reblog.postUrl}`,
      );
    }
  } else {
    console.log("No reblogs");
  }
} else if (command === "view") {
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

  const reblogs = await getAllReblogs(args.blog);

  if (reblogs) {
    for (const reblog of reblogs) {
      console.log(
        `Post ${reblog.rebloggedRootId} by ${reblog.rebloggedRootName} at ${reblog.rebloggedRootUrl} reblogged by ${reblog.blogName} at ${reblog.postUrl}`,
      );
    }
  } else {
    console.log("No reblogs");
  }
} else {
  console.error("Unknown command");
  process.exit(1);
}
