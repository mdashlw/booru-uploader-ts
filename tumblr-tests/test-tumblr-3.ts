import OAuth from "oauth";
import undici from "undici";
import { HTTPRangeReader, unzip } from "unzipit";

const oauth = new OAuth.OAuth(
  "",
  "",
  "HnTLZd5dqvJ12j6zbClyE4VTf7kM3dnSsct089hkiAhWZXhYm8",
  "eeJqy1vxAJnDNz9Nm5hh5L4irDDayLZffiMlun95FNXVtEyXCV",
  "1.0A",
  null,
  "HMAC-SHA1",
);
const authHeader = oauth.authHeader(
  "https://www.tumblr.com/api/v2/blog/fggfgfdgdfgd/backup",
  "5JXCRWKFdPiWjlEaAI8U8ujRzMgR4gzj0YBDwT0LkOBjle0A1f",
  "PXE13fBL2b9UX0xMOOANLjWG3wM5n6pH2yz18kwCtTI1XZVZgH",
);

console.log(authHeader);
