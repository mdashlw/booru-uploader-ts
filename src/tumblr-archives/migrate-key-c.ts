import { client } from "./internal.js";

const limit = 50_000;

function keyToKeyC(key: string) {
  const parts = key.split(":");

  if (parts.length > 2) {
    return null;
  }

  let key_a: string | null = parts[0];
  let key_b: string | undefined = parts[1];

  if (!key_b) {
    key_b = key_a;
    key_a = null;
  }

  let key_c: string | null = null;

  if (!key_b.includes("-")) {
    if (key_b.includes("_")) {
      key_c = key_b.substring(0, key_b.lastIndexOf("_"));
    } else {
      key_c = key_b;
    }

    key_c = key_c.substring(10, 17);

    if (key_c.length !== 7 || !key_c.startsWith("1")) {
      console.error("invalid key c (will be null):", {
        key: key,
        key_a,
        key_b,
        key_c,
      });
      key_c = null;
    } else {
      key_c = key_c.substring(1);
    }
  }

  return key_c;
}

for (let offset = 0; ; offset += limit) {
  console.log(`limit=${limit} offset=${offset}`);
  const { rows } = await client.execute(
    `select key, key_c from media order by key limit ${limit} offset ${offset}`,
  );

  if (!rows.length) {
    console.log(`rows=${rows.length} exit`);
    break;
  }

  console.log(`rows=${rows.length}`);

  await client.batch(
    rows
      .map((row) => {
        const key = row.key as string;
        const oldKeyC = row.key_c as string;
        const newKeyC = keyToKeyC(key);

        if (oldKeyC === newKeyC) {
          return null as any;
        }

        return {
          sql: "update media set key_c = ? where key = ?",
          args: [newKeyC, key],
        };
      })
      .filter(Boolean),
    "write",
  );
}
