import timers from "node:timers/promises";
// import OAuth from "oauth";
import undici from "undici";
import { HTTPRangeReader, unzip } from "unzipit";

// const oauth = new OAuth.OAuth(
//   "",
//   "",
//   "HnTLZd5dqvJ12j6zbClyE4VTf7kM3dnSsct089hkiAhWZXhYm8",
//   "eeJqy1vxAJnDNz9Nm5hh5L4irDDayLZffiMlun95FNXVtEyXCV",
//   "1.0A",
//   null,
//   "HMAC-SHA1",
// );
// const authHeader = oauth.authHeader(
//   "https://www.tumblr.com/api/v2/blog/fggfgfdgdfgd/backup",
//   "5JXCRWKFdPiWjlEaAI8U8ujRzMgR4gzj0YBDwT0LkOBjle0A1f",
//   "PXE13fBL2b9UX0xMOOANLjWG3wM5n6pH2yz18kwCtTI1XZVZgH",
// );

// console.log(authHeader);

const SID =
  "a8C1dBCu2CDBtHgsZasYPGYWxohdz7FRzAWnrx33x83SE9uzuL.a6ONndnAVJotFcvdI4XSKllDD3DsE8StNkD6ISt2Xfci763Lbe";

// console.log(
//   await undici
//     .request("https://www.tumblr.com/api/v2/blog/fggfgfdgdfgd/backup", {
//       method: "POST",
//       headers: {
//         authorization: "",
//         cookie: `sid=${SID}`,
//       },
//     })
//     .then((r) => r.body.json()),
// );

while (true) {
  const resp = await undici.request(
    "https://www.tumblr.com/api/v2/blog/fggfgfdgdfgd/backup",
    {
      headers: {
        authorization: "",
        cookie: `sid=${SID}`,
      },
    },
  );
  const data: any = await resp.body.json();

  console.log(data);

  if (data.response.status !== 3) {
    console.log(`[${data.response.status}] ${data.response.message}`);
    await timers.setTimeout(1_000);
    continue;
  }

  const url = data.response.download_link;
  const { entries } = await unzip(url);

  // console.log(entries);

  // print all entries and their sizes
  for (const [name, entry] of Object.entries(entries)) {
    console.log(name, entry.size);
  }

  break;
}
