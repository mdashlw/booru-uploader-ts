import undici from "undici";
import { z } from "zod";
import type { SourceData } from "../scraper/types.ts";
import { probeAndValidateImageUrl } from "../scraper/utils.ts";

const APIAuthor = z.object({
  id: z.string(),
  screen_name: z.string(),
});
type APIAuthor = z.infer<typeof APIAuthor>;

const APIPhoto = z.object({
  type: z.literal("photo"),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  altText: z.string().optional(),
});
type APIPhoto = z.infer<typeof APIPhoto>;

const APITweet = z.object({
  id: z.string(),
  url: z.string().url(),
  text: z.string(),
  created_timestamp: z.number().int().positive(),
  author: APIAuthor,
  media: z
    .object({
      photos: APIPhoto.array().optional(),
    })
    .optional(),
});
type APITweet = z.infer<typeof APITweet>;

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "twitter.com" ||
      url.hostname === "mobile.twitter.com" ||
      url.hostname === "x.com" ||
      url.hostname === "www.twitter.com" ||
      url.hostname === "nitter.net" ||
      url.hostname === "fxtwitter.com" ||
      url.hostname === "vxtwitter.com") &&
    /^\/\w+\/status\/\d+/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [, tweetId, _photoIdx] =
    /^\/\w+\/status\/(\d+)(?:\/photo\/(\d+))?/.exec(url.pathname)!;
  const photoIdx = _photoIdx ? Number(_photoIdx) : undefined;
  const tweet = await fetchTweet(tweetId);
  const photos = tweet.media?.photos ?? [];

  return {
    source: "Twitter",
    url: `https://x.com/${tweet.author.screen_name}/status/${tweet.id}`,
    images: await Promise.all(
      photos.map(async (media, idx) => ({
        selected: photoIdx === idx + 1,
        pageUrl: `https://x.com/${tweet.author.screen_name}/status/${tweet.id}/photo/${photos.indexOf(media) + 1}`,
        ...(await probeAndValidateImageUrl(
          `${media.url}:orig`,
          undefined,
          media.width,
          media.height,
        )),
        description: media.altText,
      })),
    ),
    artist: tweet.author.screen_name,
    date: new Date(tweet.created_timestamp * 1_000),
    title: null,
    description: tweet.text,
  };
}

async function fetchTweet(tweetId: string): Promise<APITweet> {
  const response = await undici
    .request(`https://api.fxtwitter.com/status/${tweetId}`, {
      headers: {
        "user-agent": "Derpibooru-Uploader/1.0 (by https://github.com/mdashlw)",
      },
      throwOnError: true,
    })
    .catch((error) => {
      if (
        error instanceof undici.errors.ResponseStatusCodeError &&
        error.body !== null &&
        typeof error.body === "object" &&
        "code" in error.body &&
        "message" in error.body
      ) {
        throw new Error(`${error.body.code} ${error.body.message}`);
      }

      throw error;
    });
  const json = await response.body.json();
  const data = z
    .object({
      code: z.number().int(),
      message: z.string(),
      tweet: APITweet.optional(),
    })
    .parse(json);

  if (data.code !== 200) {
    throw new Error(`${data.code} ${data.message}`);
  }

  return data.tweet!;
}
