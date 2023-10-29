import undici from "undici";
import z from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

const APIAuthor = z.object({
  id: z.string(),
  screen_name: z.string(),
});
type APIAuthor = z.infer<typeof APIAuthor>;

const APIPhoto = z.object({
  type: z.literal("photo"),
  url: z.string().url(),
  width: z.number().int(),
  height: z.number().int(),
});
type APIPhoto = z.infer<typeof APIPhoto>;

const APITweet = z.object({
  id: z.string(),
  url: z.string().url(),
  text: z.string(),
  created_timestamp: z.number().int(),
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
      url.hostname === "nitter.net") &&
    /^\/\w+\/status\/\d+/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const [, tweetId, _photoIdx] =
    /^\/\w+\/status\/(\d+)(?:\/photo\/(\d+))?/.exec(url.pathname)!;
  const photoIdx = _photoIdx ? Number(_photoIdx) : undefined;
  const tweet = await fetchTweet(tweetId).catch((error) => {
    error = new Error("Failed to fetch tweet", { cause: error });
    error.tweetId = tweetId;
    throw error;
  });

  let photos = tweet.media?.photos ?? [];

  if (photoIdx) {
    photos = [photos[photoIdx - 1]];
  }

  return {
    source: "Twitter",
    url: tweet.url,
    images: photos.map((media) => ({
      url: `${media.url}:orig`,
      type: "jpg",
      width: media.width,
      height: media.height,
    })),
    artist: tweet.author.screen_name,
    date: formatDate(new Date(tweet.created_timestamp * 1_000)),
    title: null,
    description: tweet.text,
  };
}

async function fetchTweet(tweetId: string): Promise<APITweet> {
  const response = await undici
    .request(`https://api.fxtwitter.com/status/${tweetId}`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.tweetId = tweetId;
      throw error;
    });
  const data = z
    .object({
      code: z.number().int(),
      message: z.string(),
      tweet: APITweet.optional(),
    })
    .parse(
      await response.body.json().catch((error) => {
        error = new Error("Failed to read response body", { cause: error });
        error.tweetId = tweetId;
        error.response = response;
        throw error;
      }),
    );

  if (data.code !== 200) {
    const error: any = new Error(data.message);
    error.tweetId = tweetId;
    error.response = response;
    error.data = data;
    throw error;
  }

  return data.tweet!;
}
