declare const brand: unique symbol;

type Brand<T, B> = T & { readonly [brand]: B };

export interface BaseImage {
  id: number;
  created_at: string;
  updated_at: string;
  first_seen_at: string;
  deletion_reason: string | null;
}

export interface HiddenImage extends BaseImage {
  hidden_from_users: true;
}

export interface VisibleImage extends BaseImage {
  hidden_from_users: false;
  uploader: string;
  description: string;
  tags: TagName[];
  width: number;
  height: number;
  format: string;
  representations: {
    full: string;
  };
  view_url: string;
  source_url: string | null;
  source_urls?: string[];
  orig_sha512_hash: string;
  size: number;
  orig_size: number;
}

export type Image = VisibleImage | HiddenImage;

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

export type MarkdownDialect = {
  bold: (text: string) => string;
  blockQuote: (text: string) => string;
  escape: (text: string) => string;
  boldStart: string;
  boldEnd: string;
  italicStart: string;
  italicEnd: string;
  strikethroughStart: string;
  strikethroughEnd: string;
  smallStart: string;
  smallEnd: string;
  inlineAllLinks: boolean;
  inlineLinkStart: string;
  inlineLinkEnd: (url: string) => string;
  headingStart(n: number): string;
  blockQuoteStart: string;
  blockQuoteEnd: string;
  inlineLink: (text: string, destination: string, title?: string) => string;
  inlineImage(description: string, destination: string, title: string): string;
};
