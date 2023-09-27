declare const brand: unique symbol;

type Brand<T, B> = T & { readonly [brand]: B };

export interface Image {
  id: number;
  first_seen_at: string;
  description: string;
  tags: TagName[];
  width: number;
  height: number;
  representations: {
    full: string;
  };
  view_url: string;
  source_url: string | null;
  source_urls?: string[];
}

export interface AutocompletedTag {
  label: string;
  value: string;
}

export type TagSlug = Brand<string, "TagSlug">;
export type TagName = Brand<string, "TagName">;

export interface Tag {
  slug: TagSlug;
  name: TagName;
  aliased_tag: TagSlug | null;
  aliases: TagSlug[];
  implied_tags: TagSlug[];
  implied_by_tags: TagSlug[];
  images: number;
  dnp_entries: DnpEntry[];
}

export interface DnpEntry {
  dnp_type: string;
}
