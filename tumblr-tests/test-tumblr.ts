// @ts-ignore
import util from "node:util";
// @ts-ignore
import tumblr from "tumblr.js";

util.inspect.defaultOptions.depth = Infinity;

const client = tumblr.createClient({
  consumer_key: "HnTLZd5dqvJ12j6zbClyE4VTf7kM3dnSsct089hkiAhWZXhYm8",
  consumer_secret: "eeJqy1vxAJnDNz9Nm5hh5L4irDDayLZffiMlun95FNXVtEyXCV",
  token: "5JXCRWKFdPiWjlEaAI8U8ujRzMgR4gzj0YBDwT0LkOBjle0A1f",
  token_secret: "PXE13fBL2b9UX0xMOOANLjWG3wM5n6pH2yz18kwCtTI1XZVZgH",
});

// console.log(await client.userInfo());
console.log(
  await client.createPost("fggfgfdgdfgd", {
    state: "draft",
    content: [],
    parent_tumblelog_uuid: "t:8nGmeDB2Iykr1jmcp_SqCg",
    parent_post_id: "180595404168",
    reblog_key: "WqrB5uyH",
  }),
);
