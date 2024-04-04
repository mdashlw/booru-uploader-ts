import undici from "undici";
import { z } from "zod";
import { SourceData, SourceImageData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";

const fakeArtistTags = ["sound_warning", "third-party_edit"];

const E621Post = z.object({
  id: z.number(),
  created_at: z.coerce.date(),
  file: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    ext: z.string(),
    md5: z.string(),
    url: z.string().url(),
  }),
  tags: z.object({
    artist: z.string().array(),
  }),
  description: z.string(),
});
type E621Post = z.infer<typeof E621Post>;

export function canHandle(url: URL): boolean {
  return url.hostname === "e621.net" && url.pathname.startsWith("/posts/");
}

export async function scrape(url: URL): Promise<SourceData> {
  const postId = Number(url.pathname.split("/")[2]);

  if (Number.isNaN(postId)) {
    throw new Error("Invalid URL");
  }

  const { post } = await fetchPost(postId);

  const artists = post.tags.artist.filter(
    (artist) => !fakeArtistTags.includes(artist),
  );

  let file: SourceImageData;

  if (post.file.ext === "webm") {
    file = {
      blob: await undici
        .request(post.file.url, { throwOnError: true })
        .then((response) => response.body.blob()),
      filename: `${post.file.md5}.${post.file.ext}`,
      type: post.file.ext,
      width: post.file.width,
      height: post.file.height,
    };
  } else {
    file = await probeAndValidateImageUrl(
      post.file.url,
      undefined,
      post.file.width,
      post.file.height,
    );
  }

  return {
    source: "E621",
    url: `https://e621.net/posts/${postId}`,
    images: [file],
    artist: artists,
    date: formatDate(post.created_at),
    title: null,
    description: post.description,
  };
}

function fetchPost(postId: number) {
  return fetchAPI(`/posts/${postId}.json`, z.object({ post: E621Post }));
}

async function fetchAPI<T extends z.SomeZodObject>(
  path: string,
  body: T,
): Promise<z.infer<T>> {
  const response = await undici.request(`https://e621.net${path}`, {
    headers: {
      "user-agent": "Booru-Uploader/1.0 (by https://github.com/mdashlw)",
    },
  });
  const json = await response.body.json();
  const data = z
    .union([
      z.object({
        success: z.literal(false),
        reason: z.string(),
      }),
      body,
    ])
    .parse(json);

  if (data.success === false) {
    throw new Error(data.reason);
  }

  return data;
}
