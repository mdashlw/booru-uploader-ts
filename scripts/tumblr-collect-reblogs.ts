import process from "node:process";
import undici from "undici";

const [, , _postUrl] = process.argv;

if (!_postUrl || !URL.canParse(_postUrl)) {
  console.error("Usage: <post url>");
  process.exit(1);
}

const postUrl = new URL(_postUrl);
const [, tumblelog, postId] = postUrl.pathname.split("/");

const outputBlogs = new Set<string>();

const pool = new undici.Pool("https://www.tumblr.com");

let href = `/svc/tumblelog/${tumblelog}/${postId}/notes?mode=all`;
while (href) {
  const resp = await pool.request({
    method: "GET",
    path: href,
  });
  const json: any = await resp.body.json();

  if (json.meta.status !== 200) {
    throw new Error(json.meta.msg);
  }

  for (const note of json.response.notes) {
    if (note.type !== "reblog") {
      continue;
    }

    outputBlogs.add(note.blog_name);
  }

  href = json.response._links?.next?.href;
}

console.log(
  Array.from(outputBlogs)
    .map((b) => `--blogs ${b}`)
    .join(" "),
);
