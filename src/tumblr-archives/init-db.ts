import { pool } from "./internal.ts";

// RUN THIS FILE MANUALLY
// tsx -r dotenv/config src/tumblr-archives/init-db.ts

await pool.query(`
  CREATE TABLE IF NOT EXISTS reblogs (
    root_post_id bigint NOT NULL,
    root_blog_uuid varchar(24) NOT NULL,
    root_blog_name text NOT NULL,
    reblog_post_id bigint NOT NULL,
    reblog_blog_uuid varchar(24) NOT NULL,
    reblog_blog_name text NOT NULL,
    PRIMARY KEY (root_post_id, reblog_post_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reblogs_on_rootBlogUuid ON reblogs (root_blog_uuid);
  CREATE INDEX IF NOT EXISTS idx_reblogs_on_rootBlogName ON reblogs (root_blog_name);
  CREATE TABLE IF NOT EXISTS media (
    key text PRIMARY KEY NOT NULL,
    key_a varchar(32),
    key_b text NOT NULL,
    key_c varchar(6),
    url text NOT NULL UNIQUE,
    post_id bigint NOT NULL,
    blog_uuid varchar(24) NOT NULL,
    UNIQUE (key_a, key_b)
  );
  CREATE INDEX IF NOT EXISTS idx_media_on_key_a ON media (key_a);
  CREATE INDEX IF NOT EXISTS idx_media_on_key_b ON media (key_b);
  CREATE INDEX IF NOT EXISTS idx_media_on_key_c ON media (key_c);
  CREATE INDEX IF NOT EXISTS idx_media_on_postId ON media (post_id);
`);
