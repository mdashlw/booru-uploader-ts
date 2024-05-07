export interface Tag {
  id: number;
  slug: string;
  name: string;
  aliased_tag: string | null;
  implied_tags: string[];

  resolvedAliasedTag: Tag | undefined;
  resolvedImpliedTags: Tag[] | undefined;
}

// https://github.com/philomena-dev/philomena/blob/0c865b3f2a161679dfebd8858ba754a91b78cc8d/lib/philomena/slug.ex#L42
export function convertTagSlugToName(slug: string): string {
  return decodeURIComponent(slug)
    .replaceAll("+", " ")
    .replaceAll("-plus-", "+")
    .replaceAll("-dot-", ".")
    .replaceAll("-colon-", ":")
    .replaceAll("-bwslash-", "\\")
    .replaceAll("-fwslash-", "/")
    .replaceAll("-dash-", "-");
}
