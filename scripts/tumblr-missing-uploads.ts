import process from "node:process";
import readline from "node:readline/promises";
import undici from "undici";
import z from "zod";
import { Image } from "../src/booru/types.js";

const V1Post = z.object({
  id: z.string(),
  url: z.string().url(),
  "url-with-slug": z.string().url(),
});
type V1Post = z.infer<typeof V1Post>;

const [, , blogInput] = process.argv;

if (!blogInput) {
  console.error("Usage: <blog OR blog.tumblr.com OR www.tumblr.com/blog>");
  process.exit(1);
}

let blogName: string;

if (blogInput.startsWith("http://") || blogInput.startsWith("https://")) {
  const url = new URL(blogInput);

  if (url.hostname === "www.tumblr.com") {
    blogName = url.pathname.split("/")[1];

    if (!blogName) {
      console.error("Invalid blog URL");
      process.exit(1);
    }
  } else if (url.hostname.endsWith(".tumblr.com")) {
    blogName = url.hostname.slice(0, -".tumblr.com".length);
  } else {
    console.error("Invalid blog URL");
    process.exit(1);
  }
} else {
  blogName = blogInput;
}

async function* posts() {
  let start = 0;

  while (true) {
    const response = await undici.request(
      `https://${blogName}.tumblr.com/api/read/json?start=${start}&num=50`,
    );
    const body = await response.body.text();
    const data = z
      .object({
        posts: V1Post.array(),
      })
      .parse(JSON.parse(body.slice("var tumblr_api_read = ".length, -2)));

    yield* data.posts;

    if (!data.posts.length) {
      break;
    }

    start += data.posts.length;
  }
}

async function fetchImageBySourceUrl(sourceUrl: string): Promise<Image | null> {
  const response = await undici.fetch(
    `https://derpibooru.org/api/v1/json/search/images?filter_id=56027&q=source_url:${sourceUrl}`,
  );
  const json = (await response.json()) as {
    images: Image[];
  };

  return json.images[0] ?? null;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const waitToContinue = () => rl.question("Press <enter> to continue...");

for await (const post of posts()) {
  const image = await fetchImageBySourceUrl(`*${post.id}*`);

  if (!image) {
    console.log(`${post["url-with-slug"]} is not on Derpibooru`);
    await waitToContinue();
    continue;
  }

  const sourceUrls =
    image.source_urls ?? (image.source_url ? [image.source_url] : []);

  if (!sourceUrls.includes(post["url-with-slug"])) {
    const imageUrl = `https://derpibooru.org/images/${image.id}`;

    if (sourceUrls.includes(post.url)) {
      console.log(
        `${imageUrl} is missing source ${post["url-with-slug"]} (has without slug)`,
      );
    } else {
      console.log(`${imageUrl} is missing source ${post["url-with-slug"]}`);
    }

    await waitToContinue();
  }
}
