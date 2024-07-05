import undici from "undici";
import { convertTagSlugToName, Tag } from "./index.js";

const BASE_URL = "https://derpibooru.org";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_PER_PAGE = 50;

const pool = new undici.Pool(BASE_URL);

const cachedTagsByName = new Map<string, Tag>();
const cacheTag = (tag: Tag) => {
  cachedTagsByName.set(tag.name, tag);
};

export async function fetchSimpleTagsByIds(ids: number[]): Promise<Tag[]> {
  const response = await pool.request({
    method: "GET",
    path: `/fetch/tags?${ids.map((id) => `ids[]=${id}`).join("&")}`,
    headers: {
      "user-agent": USER_AGENT,
    },
    throwOnError: true,
  });
  const json = (await response.body.json()) as { tags: Tag[] };

  return json.tags;
}

export async function fetchTagsByNames(names: string[]): Promise<Tag[]> {
  const cachedTags: Tag[] = [];
  const uncachedTagNames: string[] = [];

  for (const name of names) {
    if (cachedTagsByName.has(name)) {
      cachedTags.push(cachedTagsByName.get(name)!);
    } else {
      uncachedTagNames.push(name);
    }
  }

  if (uncachedTagNames.length) {
    const response = await pool.request({
      method: "GET",
      path: `/api/v1/json/search/tags`,
      query: {
        per_page: MAX_PER_PAGE,
        q: uncachedTagNames.join(" OR "),
      },
      headers: {
        "user-agent": USER_AGENT,
      },
      throwOnError: true,
    });
    const json = (await response.body.json()) as { tags: Tag[] };

    json.tags.forEach(cacheTag);

    return [...cachedTags, ...json.tags];
  }

  return cachedTags;
}

export function fetchTagsBySlugs(slugs: string[]): Promise<Tag[]> {
  return fetchTagsByNames(slugs.map(convertTagSlugToName));
}
