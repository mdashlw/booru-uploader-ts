import chalk from "chalk";
import process from "node:process";
import { fileURLToPath } from "node:url";
import undici from "undici";
import { z } from "zod";

type Service = {
  name: string;
  check(name: string): Promise<false | string>;
};

type DerpibooruTag = {
  name: string;
  aliased_tag: string;
  aliases: string[];
};

const services: Service[] = [
  {
    name: "Twitter",
    async check(name) {
      const response = await undici.request(
        `https://api.fxtwitter.com/${name}`,
        {
          headers: {
            "user-agent": "curl",
          },
        },
      );

      if (response.statusCode === 302) {
        return false;
      }

      const json = await response.body.json();
      const data = z
        .union([
          z.object({
            code: z.literal(200),
            message: z.literal("OK"),
            user: z.object({
              url: z.string().url(),
            }),
          }),
          z.object({
            code: z.literal(404),
            message: z.literal("User not found"),
            user: z.undefined(),
          }),
          z.object({
            code: z.number(),
            message: z.string(),
            user: z.undefined(),
          }),
        ])
        .parse(json);

      if (data.code === 404) {
        return false;
      }

      if (data.code !== 200 || data.user === undefined) {
        throw new Error(`${data.code} ${data.message}`);
      }

      return data.user.url;
    },
  },
  {
    name: "Commishes",
    async check(name) {
      const response = await undici.request(
        `https://portfolio.commishes.com/user/${name}.json`,
        {
          throwOnError: true,
        },
      );
      const body = await response.body.text();

      try {
        JSON.parse(body);
      } catch (error) {
        return false;
      }

      return `https://portfolio.commishes.com/user/${name}`;
    },
  },
  {
    name: "Itaku",
    async check(name) {
      try {
        await undici.request(`https://itaku.ee/api/user_profiles/${name}/`, {
          method: "HEAD",
          throwOnError: true,
        });
      } catch (error: any) {
        if (
          error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
          error.statusCode === 404
        ) {
          return false;
        }

        throw error;
      }

      return `https://itaku.ee/profile/${name}`;
    },
  },
  {
    name: "DeviantArt",
    async check(name) {
      try {
        await undici.request(`https://www.deviantart.com/${name}`, {
          method: "HEAD",
          throwOnError: true,
        });
      } catch (error: any) {
        if (
          error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
          error.statusCode === 404
        ) {
          return false;
        }

        throw error;
      }

      return `https://www.deviantart.com/${name}`;
    },
  },
  {
    name: "Tumblr",
    async check(name) {
      try {
        await undici.request(`https://www.tumblr.com/${name}`, {
          method: "HEAD",
          throwOnError: true,
        });
      } catch (error: any) {
        if (
          error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
          error.statusCode === 404
        ) {
          return false;
        }

        throw error;
      }

      return `https://www.tumblr.com/${name}`;
    },
  },
  {
    name: "Boosty",
    async check(name) {
      try {
        const response = await undici.request(
          `https://api.boosty.to/v1/blog/${name}`,
          {
            throwOnError: true,
          },
        );
        await response.body.json();
      } catch (error: any) {
        if (
          error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
          error.statusCode === 404
        ) {
          return false;
        }

        throw error;
      }

      return `https://boosty.to/${name}`;
    },
  },
  {
    name: "Fur Affinity",
    async check(name) {
      const response = await undici.request(
        `https://www.furaffinity.net/user/${name}`,
        { throwOnError: true },
      );
      const body = await response.body.text();

      if (body.includes("This user cannot be found.")) {
        return false;
      }

      return `https://www.furaffinity.net/user/${name}`;
    },
  },
  {
    name: "Inkbunny",
    /*async check(name) {
      const response = await undici.request(
        `https://inkbunny.net/gallery/${name}`,
        {
          method: "HEAD",
          throwOnError: true,
        },
      );

      if (response.statusCode !== 302) {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      const location = response.headers["location"];

      if (typeof location !== "string") {
        throw new Error(`Unexpected location header: ${location}`);
      }

      if (
        location.startsWith("/members_process.php") ||
        location.startsWith("/error.php")
      ) {
        return false;
      }

      if (!location.startsWith("/usergallery_process.php")) {
        throw new Error(`Unexpected location: ${location}`);
      }

      return `https://inkbunny.net/${name}`;
    },*/
    async check(name) {
      const response = await undici.request(
        `https://inkbunny.net/api_username_autosuggest.php?username=${name}`,
        { throwOnError: true },
      );
      const json = (await response.body.json()) as {
        results: { singleword: string }[];
      };
      const result = json.results.find(
        ({ singleword }) => singleword.toLowerCase() === name.toLowerCase(),
      );

      if (!result) {
        return false;
      }

      return `https://inkbunny.net/${result.singleword}`;
    },
  },
  {
    name: "YCH.art",
    async check(name) {
      try {
        const response = await undici.request(`https://ych.art/user/${name}`, {
          throwOnError: true,
        });
        await response.body.dump();
      } catch (error: any) {
        if (
          error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
          error.statusCode === 404
        ) {
          return false;
        }

        throw error;
      }

      return `https://ych.art/user/${name}`;
    },
  },
  {
    name: "Bluesky",
    async check(name) {
      const handle = `${name}.bsky.social`;

      const data: any = await undici
        .request(
          `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
        )
        .then((response) => response.body.json());

      if (data.error) {
        if (
          data.error === "InvalidRequest" &&
          (data.message === "Unable to resolve handle" ||
            data.message === "Error: handle must be a valid handle")
        ) {
          return false;
        }

        throw new Error(`${data.error}: ${data.message}`);
      }

      if (!data.did) {
        throw new Error(`Invalid response: ${JSON.stringify(data)}`);
      }

      return `https://bsky.app/profile/${handle}`;
    },
  },
  {
    name: "Reddit",
    async check(name) {
      const response = await undici.request(
        `https://old.reddit.com/user/${encodeURIComponent(name)}/about.json`,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          },
        },
      );
      const data: any = await response.body.json();

      if ("error" in data) {
        if (data.error === 404) {
          return false;
        }

        throw new Error(`${data.error}: ${data.message}`);
      }

      return `https://www.reddit.com${data.data.subreddit.url}`;
    },
  },
  {
    name: "Weasyl",
    async check(name) {
      const response = await undici.request(
        `https://www.weasyl.com/api/users/${encodeURIComponent(name)}/view`,
      );
      const data: any = await response.body.json();

      if (data.error) {
        if (data.error.name === "userRecordMissing") {
          return false;
        }

        throw new Error(data.error.name);
      }

      return `https://www.weasyl.com/~${data.username}`;
    },
  },
  {
    name: "Hentai Foundry",
    async check(name) {
      const response = await undici.request(
        `https://www.hentai-foundry.com/user/${encodeURIComponent(name)}?enterAgree=1`,
        { method: "HEAD" },
      );

      if (response.statusCode === 404) {
        return false;
      }

      if (response.statusCode !== 301) {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      return `https://www.hentai-foundry.com${response.headers.location}`;
    },
  },
  {
    name: "Newgrounds",
    async check(name) {
      if (name.includes(".")) {
        return false;
      }

      const response = await undici.request(
        `https://${encodeURIComponent(name)}.newgrounds.com`,
        { method: "HEAD" },
      );

      if (response.statusCode === 404) {
        return false;
      }

      if (response.statusCode !== 200) {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      return `https://${encodeURIComponent(name)}.newgrounds.com`;
    },
  },
  {
    name: "Pillowfort",
    async check(name) {
      if (name.includes(".")) {
        return false;
      }

      const response = await undici.request(
        `https://www.pillowfort.social/${encodeURIComponent(name)}/json/`,
        { method: "HEAD" },
      );

      if (response.statusCode === 404) {
        return false;
      }

      if (response.statusCode !== 200) {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      return `https://www.pillowfort.social/${name}`;
    },
  },
];

// https://github.com/philomena-dev/philomena/blob/0c865b3f2a161679dfebd8858ba754a91b78cc8d/lib/philomena/slug.ex#L42
function convertTagSlugToName(slug: string): string {
  return decodeURIComponent(slug)
    .replaceAll("+", " ")
    .replaceAll("-plus-", "+")
    .replaceAll("-dot-", ".")
    .replaceAll("-colon-", ":")
    .replaceAll("-bwslash-", "\\")
    .replaceAll("-fwslash-", "/")
    .replaceAll("-dash-", "-");
}

export async function checkAndPrint(name: string): Promise<void> {
  let rawNames;

  if (name.startsWith("artist:")) {
    let {
      tags: [tag],
    } = (await (
      await undici.fetch(
        `https://derpibooru.org/api/v1/json/search/tags?q=name:${name}`,
      )
    ).json()) as {
      tags: DerpibooruTag[];
    };

    if (!tag) {
      throw new Error(`Could not find artist tag: ${name}`);
    }

    if (tag.aliased_tag) {
      ({ tag } = (await (
        await undici.fetch(
          `https://derpibooru.org/api/v1/json/tags/${tag.aliased_tag}`,
        )
      ).json()) as { tag: DerpibooruTag });
    }

    rawNames = [
      tag.name,
      ...tag.aliases.map((slug: string) => convertTagSlugToName(slug)),
    ].map((name) =>
      name.startsWith("artist:") ? name.substring("artist:".length) : name,
    );
  } else {
    rawNames = [name];
  }

  const allNames = new Set(
    rawNames.flatMap((it) => [
      it,
      it.replaceAll(" ", "-"),
      it.replaceAll(" ", "_"),
      it.replaceAll("_", ""),
      it.replaceAll("-", ""),
      it.replaceAll("-", "_"),
      it.replaceAll("_", "-"),
      it.replace(/_$/, ""),
      it.replace(/^_/, ""),
      it.replaceAll(".", "_"),
      it.replaceAll(".", "-"),
      it.replaceAll(".", ""),
      it.replaceAll(" ", "."),
      it.replaceAll("_", "."),
      it.replaceAll("-", "."),
    ]),
  );

  for (const name of allNames) {
    const results = await Promise.all(
      services.map((service) =>
        service.check(name).then(
          (value) =>
            ({
              service,
              status: "fulfilled",
              value,
            }) as const,
          (reason) =>
            ({
              service,
              status: "rejected",
              reason,
            }) as const,
        ),
      ),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.log(
          chalk.red(
            `❌ ${result.service.name} (${name}): ${
              result.reason?.message ?? result.reason
            }`,
          ),
        );
      } else if (result.status === "fulfilled") {
        if (result.value) {
          console.log(
            chalk.greenBright(`✅ ${result.service.name}: ${result.value}`),
          );
        } else {
          console.log(chalk.redBright(`❌ ${result.service.name} (${name})`));
        }
      }
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , name] = process.argv;

  if (!name) {
    console.error("Usage: <name> OR artist:name");
    process.exit(1);
  }

  await checkAndPrint(name.toLowerCase());
}
