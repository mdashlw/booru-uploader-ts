import undici from "undici";
import { z } from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate, probeAndValidateImageUrl } from "../scraper/utils.js";

const InitialState = z.object({
  note: z.object({
    currentNoteId: z.string(),
    noteDetailMap: z.record(
      z.object({
        note: z.object({
          title: z.string(),
          desc: z.string(),
          time: z.number().int().positive().pipe(z.coerce.date()),
          user: z.object({
            nickname: z.string(),
          }),
          imageList: z
            .object({
              height: z.number().int().positive(),
              width: z.number().int().positive(),
              urlDefault: z.string().url(),
            })
            .array(),
        }),
      }),
    ),
  }),
});
type InitialState = z.infer<typeof InitialState>;

export function canHandle(url: URL): boolean {
  return url.hostname === "www.xiaohongshu.com";
}

function parsePostId(url: URL) {
  const match =
    /^(?:\/explore\/|\/discovery\/item\/|\/user\/profile\/\w+\/)(\w+)$/.exec(
      url.pathname,
    );

  if (!match) {
    throw new Error(`Invalid path: ${url.pathname}`);
  }

  return match[1];
}

function convertImageUrl(url: URL): string {
  if (url.hostname === "ci.xiaohongshu.com") {
    url.search = "";
    return url.href;
  }

  if (url.hostname.endsWith(".xhscdn.com")) {
    url.hostname = "ci.xiaohongshu.com";
    url.pathname = `/${url.pathname.split("/").slice(3).join("/").split("!")[0]}`;
    return url.href;
  }

  throw new Error(`Invalid image url: ${url.href}`);
}

export async function scrape(url: URL): Promise<SourceData> {
  const postId = parsePostId(url);
  const initialState = await fetchInitialState(postId);

  if (initialState.note.currentNoteId !== postId) {
    throw new Error("Initial state does not match post id");
  }

  const note = initialState.note.noteDetailMap[postId].note;

  return {
    source: "Xiaohongshu",
    url: `https://www.xiaohongshu.com/explore/${postId}`,
    images: await Promise.all(
      note.imageList.map((image) =>
        probeAndValidateImageUrl(
          convertImageUrl(new URL(image.urlDefault)),
          undefined,
          image.width,
          image.height,
        ),
      ),
    ),
    artist: note.user.nickname,
    date: formatDate(note.time),
    title: note.title,
    description: note.desc,
  };
}

async function fetchInitialState(postId: string) {
  const response = await undici.request(
    `https://www.xiaohongshu.com/explore/${postId}`,
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      throwOnError: true,
    },
  );
  const html = await response.body.text();
  const match = /window\.__INITIAL_STATE__=({.+})/.exec(html);

  if (!match) {
    throw new Error("Failed to find initial state");
  }

  const text = match[1].replaceAll("undefined", "null");
  const json = JSON.parse(text);
  const data = InitialState.parse(json);

  return data;
}
