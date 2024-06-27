import pg from "pg";

export const client = new pg.Client();

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS reblogs (
    rootPostId bigint NOT NULL,
    rootBlogUuid varchar(24) NOT NULL,
    rootBlogName text NOT NULL,
    reblogPostId bigint NOT NULL,
    reblogBlogUuid varchar(24) NOT NULL,
    reblogBlogName text NOT NULL,
    PRIMARY KEY (rootPostId, reblogPostId)
  );
  CREATE INDEX IF NOT EXISTS idx_reblogs_on_rootBlogUuid ON reblogs(rootBlogUuid);
  CREATE INDEX IF NOT EXISTS idx_reblogs_on_rootBlogName ON reblogs(rootBlogName);
  CREATE TABLE IF NOT EXISTS media (
    key text PRIMARY KEY NOT NULL,
    key_a varchar(32),
    key_b text NOT NULL,
    key_c varchar(6),
    url text NOT NULL UNIQUE,
    postId bigint NOT NULL,
    blogUuid varchar(24) NOT NULL,
    UNIQUE (key_a, key_b)
  );
  CREATE INDEX IF NOT EXISTS idx_media_on_key_a ON media(key_a);
  CREATE INDEX IF NOT EXISTS idx_media_on_key_b ON media(key_b);
  CREATE INDEX IF NOT EXISTS idx_media_on_key_c ON media(key_c);
  CREATE INDEX IF NOT EXISTS idx_media_on_postId ON media(postId);
`);
