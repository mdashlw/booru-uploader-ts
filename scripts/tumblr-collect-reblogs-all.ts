import process from "node:process";
import undici from "undici";
import { getAllReblogs } from "../src/tumblr-archives/index.ts";
import exitHook from "exit-hook";

const [, , blogName] = process.argv;

if (!blogName) {
  console.error("Usage: <blog name>");
  process.exit(1);
}

const posts = (await getAllReblogs(blogName)).map((l) => l[0]);

const outputBlogs = new Set<string>();

const pool = new undici.Pool("https://www.tumblr.com");

console.log(posts.length, "posts");

const checkedBlogs = new Set();

exitHook(() => {
  console.log(
    Array.from(outputBlogs)
      .map((b) => `--blogs ${b}`)
      .join(" "),
  );
});

for (const post of posts) {
  if (checkedBlogs.has(post.reblog_blog_name)) {
    continue;
  }

  checkedBlogs.add(post.reblog_blog_name);

  let href = `/svc/tumblelog/${post.reblog_blog_name}/${post.reblog_post_id}/notes?mode=all`;
  while (href) {
    console.log(href);
    let json: any;

    for (let at = 0; at < 10; at++) {
      try {
        const resp = await pool.request({
          method: "GET",
          path: href,
          headers: {
            cookie:
              "euconsent-v2=CQJDuQAQJDuQAECACAENBSEgAPLAAELAAKiQGTgBxCJUCCFBIGBHAIIEIAgMQDAAQgQAAAIAAQAAAAAAEIgAgAAAAAAAACAAAAAAAAAAIAAAAAAAAAAAAIAABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAEQABAAAEAAEAAAAAAAIACBk4AIAgVAABQABAQQAABAAAAEAQAEAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQAABAAAAAAAAAAAAAgAAAAA; euconsent-v2-noniab=AAhFgAAA; euconsent-v2-analytics=1",
          },
        });
        json = await resp.body.json();
        break;
      } catch (error: any) {
        console.error(`Failed to fetch ${href} attempt ${at}`, error);
        continue;
      }
    }

    if (json.meta.status !== 200) {
      console.error(href, json.meta.msg);
      break;
    }

    for (const note of json.response.notes) {
      if (note.type !== "reblog") {
        continue;
      }

      outputBlogs.add(note.blog_name);
    }

    href = json.response._links?.next?.href;
  }
}
