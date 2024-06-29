import Bluebird from "bluebird";
import fs from "node:fs";
import process from "node:process";
import util from "node:util";
import { archivePosts, getMediaByPostId, getReblogs } from "./index.js";

util.inspect.defaultOptions.depth = null;

const [, , command] = process.argv;

if (!command) {
  console.error("Usage:");
  console.error(
    "- cli.ts archive [--concurrency <number>] --blogs <blog name> [--blogs <blog name>]...",
  );
  console.error("- cli.ts reblogs --postId <post id>");
  console.error("- cli.ts media --postId <post id>");
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

  if (Number.isNaN(concurrency) || concurrency < 1) {
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
      postId: {
        type: "string",
      },
    },
  });

  if (!args.postId) {
    console.error("Invalid usage: missing --postId <post id>");
    process.exit(1);
  }

  const reblogs = await getReblogs(args.postId);

  console.log(`Found ${reblogs.length} reblogs for post ${args.postId}`);

  for (const reblog of reblogs) {
    const reblogUrl = `https://www.tumblr.com/${reblog.reblog_blog_name}/${reblog.reblog_post_id}`;

    console.log(`- ${reblogUrl}`);
  }
} else if (command === "media") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      postId: {
        type: "string",
      },
    },
  });

  if (!args.postId) {
    console.error("Invalid usage: missing --postId <post id>");
    process.exit(1);
  }

  const media = await getMediaByPostId(args.postId);

  console.log(`Found ${media.length} media items for post ${args.postId}`);

  for (const item of media.sort((a, b) => b.key.localeCompare(a.key))) {
    console.log(`- ${item.url}`);
  }
} else {
  console.error("Unknown command");
  process.exit(1);
}
