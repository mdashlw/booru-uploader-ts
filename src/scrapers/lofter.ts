import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";
import { convertHtmlToMarkdown } from "../utils/html-to-markdown.js";

const InitializeData = z.object({
  blogInfo: z.object({
    blogName: z.string(),
  }),
  postData: z
    .object({
      postView: z.object({
        title: z.string(),
        publishTime: z.number().int().positive().pipe(z.coerce.date()),
        digest: z.string(),
        tagList: z.string().array(),
        permalink: z.string(),
        photoPostView: z.object({
          photoLinks: z
            .object({
              orign: z.string().url(),
              ow: z.number().int().positive(),
              oh: z.number().int().positive(),
            })
            .array(),
        }),
      }),
    })
    .optional(),
});
type InitializeData = z.infer<typeof InitializeData>;

export function canHandle(url: URL): boolean {
  return (
    url.hostname.endsWith(".lofter.com") && url.pathname.startsWith("/post/")
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const permalink = url.pathname.substring("/post/".length);
  const { blogInfo, postData } = await fetchInitializeData(permalink);

  if (postData === undefined) {
    throw new Error("Post does not exist");
  }

  return {
    source: "Lofter",
    url: `https://${blogInfo.blogName}.lofter.com/post/${postData.postView.permalink}`,
    images: await Promise.all(
      postData.postView.photoPostView.photoLinks.map(({ orign, ow, oh }) =>
        probeAndValidateImageUrl(
          orign.includes("?") ? orign.substring(0, orign.indexOf("?")) : orign,
          undefined,
          ow,
          oh,
        ),
      ),
    ),
    artist: blogInfo.blogName,
    date: formatDate(postData.postView.publishTime),
    title: postData.postView.title,
    description: (booru) => {
      let description = convertHtmlToMarkdown(
        postData.postView.digest,
        booru.markdown,
      );

      if (postData.postView.tagList.length) {
        if (description) {
          description += "\n\n";
        }

        description += postData.postView.tagList
          .map((tag) => `#${tag}`)
          .join(" ");
      }

      return description;
    },
  };
}

async function fetchInitializeData(permalink: string): Promise<InitializeData> {
  const response = await undici
    .request(
      `https://www.lofter.com/newweb/post/detail.json?permalink=${permalink}`,
      { throwOnError: true },
    )
    .catch((error) => {
      error.permalink = permalink;
      throw new Error("Failed to fetch", { cause: error });
    });
  const json = await response.body.json().catch((error) => {
    error.permalink = permalink;
    error.response = response;
    throw new Error("Failed to read response body", { cause: error });
  });
  const data = z
    .object({
      code: z.literal(0),
      data: InitializeData,
    })
    .parse(json);

  return data.data;
}
