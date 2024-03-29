import { createClient } from "@libsql/client";
import retry from "async-retry";
import process from "node:process";

if (!process.env.TUMBLR_ARCHIVES_LIBSQL_URL) {
  throw new Error("Missing TUMBLR_ARCHIVES_LIBSQL_URL environment variable");
}

if (!process.env.TUMBLR_ARCHIVES_LIBSQL_AUTH_TOKEN) {
  throw new Error(
    "Missing TUMBLR_ARCHIVES_LIBSQL_AUTH_TOKEN environment variable",
  );
}

export const client = createClient({
  url: process.env.TUMBLR_ARCHIVES_LIBSQL_URL,
  authToken: process.env.TUMBLR_ARCHIVES_LIBSQL_AUTH_TOKEN,
  intMode: "string",
  fetch: (request) =>
    retry(() => fetch(request), {
      retries: 3,
      onRetry(error, attempt) {
        console.error(`libsql client fetch error (attempt ${attempt})`, error);
      },
    }),
});

await client.execute(
  "CREATE TABLE IF NOT EXISTS reblogs (\
    rootPostId INTEGER NOT NULL, \
    rootBlogUuid TEXT NOT NULL, \
    rootBlogName TEXT NOT NULL, \
    reblogPostId INTEGER NOT NULL, \
    reblogBlogUuid TEXT NOT NULL, \
    reblogBlogName TEXT NOT NULL, \
    PRIMARY KEY (rootPostId, reblogPostId)\
  ) WITHOUT ROWID, STRICT",
);
await client.execute(
  "CREATE INDEX IF NOT EXISTS reblogs_rootBlogName_index ON reblogs(rootBlogName)",
);
