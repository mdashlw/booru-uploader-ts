import undici from "undici";
import { Tag } from "./index.js";

const BASE_URL = "https://derpibooru.org";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_PER_PAGE = 50;

const pool = new undici.Pool(BASE_URL);

const cachedTagsById = new Map<number, Tag>();
const cachedTagsBySlug = new Map<string, Tag>();
const cachedTagsByName = new Map<string, Tag>();
const cacheTag = (tag: Tag) => {
  cachedTagsById.set(tag.id, tag);
  cachedTagsBySlug.set(tag.slug, tag);
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

async function fetchTagsByKeys<T>(
  keyType: string,
  cache: Map<T, Tag>,
  keys: T[],
): Promise<Tag[]> {
  const cachedTags: Tag[] = [];
  const uncachedTagKeys: T[] = [];

  for (const key of keys) {
    if (cache.has(key)) {
      cachedTags.push(cache.get(key)!);
    } else {
      uncachedTagKeys.push(key);
    }
  }

  if (uncachedTagKeys.length) {
    const response = await pool.request({
      method: "GET",
      path: `/api/v1/json/search/tags?per_page=${MAX_PER_PAGE}&q=${uncachedTagKeys
        .map((key) =>
          keyType === "slug" ? key : encodeURIComponent(`${keyType}:${key}`),
        )
        .join("%20OR%20")}`,
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

export function fetchTagsByIds(ids: number[]): Promise<Tag[]> {
  return fetchTagsByKeys("id", cachedTagsById, ids);
}

export function fetchTagsBySlugs(slugs: string[]): Promise<Tag[]> {
  return fetchTagsByKeys("slug", cachedTagsBySlug, slugs);
}

export function fetchTagsByNames(names: string[]): Promise<Tag[]> {
  return fetchTagsByKeys("name", cachedTagsByName, names);
}
