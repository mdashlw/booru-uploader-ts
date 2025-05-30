import fs from "node:fs";
import undici from "undici";
import child_process from "node:child_process";
import process from "node:process";
import Fastify from "fastify";

const SCOPE = "browse stash basic";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

fastify.get<{
  Querystring: {
    code: string;
  };
}>("/callback", async (request, reply) => {
  const code = request.query.code;

  const response = await undici.request(
    "https://www.deviantart.com/oauth2/token",
    {
      query: {
        client_id: process.env.DEVIANTART_CLIENT_ID!,
        client_secret: process.env.DEVIANTART_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost:1341/callback",
      },
      throwOnError: true,
    },
  );
  const json: any = await response.body.json();

  console.log(json);

  const oauth = await fs.promises
    .readFile("oauth.json", "utf8")
    .then(JSON.parse)
    .catch(() => ({}));
  oauth.deviantart = {
    refreshToken: json.refresh_token,
    scope: SCOPE,
  };
  await fs.promises.writeFile("oauth.json", JSON.stringify(oauth), "utf8");

  reply.code(200).send("OK");
  fastify.close();
  console.log("DONE");
});

try {
  await fastify.listen({ port: 1341 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

const authorizeUrl =
  "https://www.deviantart.com/oauth2/authorize?" +
  new URLSearchParams({
    response_type: "code",
    client_id: process.env.DEVIANTART_CLIENT_ID!,
    redirect_uri: "http://localhost:1341/callback",
    scope: SCOPE,
  });

console.log("\n");
console.log(authorizeUrl);

try {
  child_process.execSync(`open "${authorizeUrl}"`, { stdio: "inherit" });
} catch {
  console.log("\nopen the above url in your browser");
}
