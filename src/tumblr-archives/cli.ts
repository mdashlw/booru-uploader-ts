import Bluebird from "bluebird";
import fs from "node:fs";
import process from "node:process";
import util from "node:util";
import {
  archivePosts,
  getMediaByKey,
  getMediaByKeyA,
  getMediaByKeyB,
  getMediaByKeyC,
  getMediaByPostId,
  getReblogs,
  type ArchivedTumblrMedia,
} from "./index.ts";

util.inspect.defaultOptions.depth = null;

const [, , command] = process.argv;

if (!command) {
  console.error("Usage:");
  console.error(
    "- cli.ts archive [--concurrency <number>] --blogs <blog name> [--blogs <blog name>]...",
  );
  console.error("- cli.ts reblogs --postId <post id>");
  console.error("- cli.ts media --postId <post id>");
  console.error("- cli.ts media --key <media key>");
  console.error("- cli.ts media --keyA <media key a>");
  console.error("- cli.ts media --keyB <media key b>");
  console.error("- cli.ts media --keyC <media key c>");
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
    const reblogUrl = `https://www.tumblr.com/${reblog.reblog_blog_name}/${reblog.reblog_post_id} (${reblog.root_blog_name} / ${reblog.root_blog_uuid})`;

    console.log(`- ${reblogUrl}`);
  }
} else if (command === "media") {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(3),
    options: {
      postId: {
        type: "string",
      },
      key: {
        type: "string",
      },
      keyA: {
        type: "string",
      },
      keyB: {
        type: "string",
      },
      keyC: {
        type: "string",
      },
    },
  });

  if (!args.postId && !args.key && !args.keyA && !args.keyB && !args.keyC) {
    console.error(
      "Invalid usage: missing --postId <post id> OR --key <media key> OR --keyA <media key a> OR --keyB <media key b> OR --keyC <media key c>",
    );
    process.exit(1);
  }

  let media: ArchivedTumblrMedia[] = [];

  if (args.postId) {
    media = await getMediaByPostId(args.postId);
    console.log(`Found ${media.length} media items for post ${args.postId}`);
  } else if (args.key) {
    media = await getMediaByKey(args.key);
  } else if (args.keyA) {
    media = await getMediaByKeyA(args.keyA);
  } else if (args.keyB) {
    media = await getMediaByKeyB(args.keyB);
  } else if (args.keyC) {
    media = await getMediaByKeyC(args.keyC);
  }

  for (const item of media.sort((a, b) => b.key.localeCompare(a.key))) {
    console.log(item);
  }
} else {
  console.error("Unknown command");
  process.exit(1);
}
