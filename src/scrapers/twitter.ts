import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

interface Tweet {
  url: string;
  text: string;
  created_timestamp: number;
  author: User;
  media?: {
    all: Media[];
    photos?: Media[];
    videos?: Media[];
  };
}

interface User {
  screen_name: string;
}

interface Media {
  url: string;
  width: number;
  height: number;
}

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "twitter.com" ||
      url.hostname === "mobile.twitter.com" ||
      url.hostname === "x.com" ||
      url.hostname === "www.twitter.com") &&
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
      width: media.width,
      height: media.height,
    })),
    artist: tweet.author.screen_name,
    date: formatDate(new Date(tweet.created_timestamp * 1_000)),
    title: null,
    description: tweet.text,
  };
}

async function fetchTweet(tweetId: string): Promise<Tweet> {
  const response = await undici
    .request(`https://api.fxtwitter.com/status/${tweetId}`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.tweetId = tweetId;
      throw error;
    });
  const data = (await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.tweetId = tweetId;
    error.response = response;
    throw error;
  })) as {
    code: number;
    message: string;
    tweet: Tweet;
  };

  if (data.code !== 200) {
    const error: any = new Error(data.message);
    error.tweetId = tweetId;
    error.response = response;
    error.data = data;
    throw error;
  }

  return data.tweet;
}
