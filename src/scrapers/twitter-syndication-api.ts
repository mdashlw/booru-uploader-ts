import undici from "undici";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";

interface User {
  screen_name: string;
}

interface Tweet {
  id_str: string;
  created_at: string;
  display_text_range: [number, number];
  entities: {
    urls: {
      url: string;
      expanded_url: string;
      indices: [number, number];
    }[];
  };
  text: string;
  user: User;
  mediaDetails:
    | {
        media_url_https: string;
        original_info: {
          width: number;
          height: number;
        };
      }[]
    | undefined;
}

export function canHandle(url: URL): boolean {
  return (
    url.hostname === "twitter.com" && /^\/\w+\/status\/\d+$/.test(url.pathname)
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const tweetId = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);
  const tweet = await fetchTweetDetail(tweetId).catch((error) => {
    throw new Error(`Failed to fetch tweet ${tweetId}`, { cause: error });
  });

  return {
    source: "Twitter",
    url: `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    images: (tweet.mediaDetails ?? []).map(
      ({ media_url_https, original_info: { width, height } }) => ({
        url: `${media_url_https}:orig`,
        width,
        height,
      }),
    ),
    artist: tweet.user.screen_name,
    date: formatDate(new Date(tweet.created_at)),
    title: null,
    // description: htmlEntities.decode(text), // todo
    description: extractDisplayText(tweet),
  };
}

async function fetchTweetDetail(tweetId: string): Promise<Tweet> {
  return (await (
    await undici.fetch(
      new URL(
        "/tweet-result?" +
          new URLSearchParams({
            id: tweetId,
            lang: "en",
            token: Date.now().toString(),
          }),
        "https://cdn.syndication.twimg.com",
      ),
    )
  ).json()) as Tweet;
}

function extractDisplayText(tweet: Tweet): string {
  let text = tweet.text.slice(...tweet.display_text_range);

  for (const { url, expanded_url } of tweet.entities.urls) {
    text = text.replaceAll(url, expanded_url);
  }

  return text;
}
