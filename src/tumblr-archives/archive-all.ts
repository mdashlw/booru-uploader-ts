import { archivePosts } from "./index.js";
import { client } from "./internal.js";

const { rows } = await client.execute(
  "SELECT DISTINCT reblogBlogUuid FROM reblogs",
);

console.log(`${rows.length} unique blogs`);
for (const { reblogBlogUuid } of rows) {
  console.log(`- ${reblogBlogUuid}`);
}

console.log("-".repeat(100));

for (const row of rows) {
  const blogName = row.reblogBlogUuid as string;

  try {
    console.log(`Starting to archive blog ${blogName}`);
    await archivePosts(blogName);
    console.log(`Finished archiving blog ${blogName}`);
  } catch (error) {
    console.error(`Failed to archive blog ${blogName}`, error);
  }
}
