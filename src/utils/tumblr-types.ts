import { z } from "zod";

export const NpfMediaObject = z.object({
  url: z.string(),
  type: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  hasOriginalDimensions: z.boolean().optional(),
  mediaKey: z.string().optional(),
});
export type NpfMediaObject = z.infer<typeof NpfMediaObject>;

export const NpfInlineTextFormatting = z.intersection(
  z.object({
    type: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }),
  z.discriminatedUnion("type", [
    z.object({
      type: z.enum(["bold", "italic", "strikethrough", "small"]),
    }),
    z.object({
      type: z.literal("link"),
      url: z.string(),
    }),
    z.object({
      type: z.literal("mention"),
    }),
    z.object({
      type: z.literal("color"),
    }),
  ]),
);
export type NpfInlineTextFormatting = z.infer<typeof NpfInlineTextFormatting>;

export const NpfTextBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
  subtype: z
    .enum([
      "heading1",
      "heading2",
      "quirky",
      "quote",
      "indented",
      "chat",
      "ordered-list-item",
      "unordered-list-item",
    ])
    .optional(),
  formatting: NpfInlineTextFormatting.array().optional(),
});
export type NpfTextBlock = z.infer<typeof NpfTextBlock>;

export const NpfLinkBlock = z.object({
  type: z.literal("link"),
});
export type NpfLinkBlock = z.infer<typeof NpfLinkBlock>;

export const NpfImageBlock = z.object({
  type: z.literal("image"),
  media: NpfMediaObject.array(),
});
export type NpfImageBlock = z.infer<typeof NpfImageBlock>;

export const NpfVideoBlock = z.object({
  type: z.literal("video"),
  media: NpfMediaObject.optional(),
});
export type NpfVideoBlock = z.infer<typeof NpfVideoBlock>;

export const NpfAudioBlock = z.object({
  type: z.literal("audio"),
});
export type NpfAudioBlock = z.infer<typeof NpfAudioBlock>;

export const NpfPollBlock = z.object({
  type: z.literal("poll"),
});
export type NpfPollBlock = z.infer<typeof NpfPollBlock>;

export const NpfContentBlock = z.discriminatedUnion("type", [
  NpfTextBlock,
  NpfLinkBlock,
  NpfImageBlock,
  NpfVideoBlock,
  NpfAudioBlock,
  NpfPollBlock,
]);
export type NpfContentBlock = z.infer<typeof NpfContentBlock>;

export const V1RegularPost = z.object({
  type: z.literal("regular"),
  "regular-body": z.string(),
});
export type V1RegularPost = z.infer<typeof V1RegularPost>;

export const V1PhotoPost = z.object({
  type: z.literal("photo"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  photos: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .array(),
});
export type V1PhotoPost = z.infer<typeof V1PhotoPost>;

export const V1AnswerPost = z.object({
  type: z.literal("answer"),
  question: z.string(),
  answer: z.string(),
});
export type V1AnswerPost = z.infer<typeof V1AnswerPost>;

export const V1Post = z.discriminatedUnion("type", [
  V1RegularPost,
  V1PhotoPost,
  V1AnswerPost,
]);
export type V1Post = z.infer<typeof V1Post>;

export const Blog = z.object({
  name: z.string(),
  url: z.string().url(),
  uuid: z.string().startsWith("t:"),
});
export type Blog = z.infer<typeof Blog>;

export const NpfLayoutAsk = z.object({
  type: z.literal("ask"),
  blocks: z.number().nonnegative().array(),
  attribution: z
    .object({
      type: z.literal("blog"),
      blog: Blog,
    })
    .optional(),
});
export type NpfLayoutAsk = z.infer<typeof NpfLayoutAsk>;

export const NpfLayoutRows = z.object({
  type: z.literal("rows"),
  display: z
    .object({
      blocks: z.number().nonnegative().array(),
    })
    .array(),
});
export type NpfLayoutRows = z.infer<typeof NpfLayoutRows>;

export const NpfLayoutBlock = z.discriminatedUnion("type", [
  NpfLayoutAsk,
  NpfLayoutRows,
]);
export type NpfLayoutBlock = z.infer<typeof NpfLayoutBlock>;

export const ReblogTrail = z.union([
  z.object({
    content: NpfContentBlock.array(),
    layout: NpfLayoutBlock.array(),
    post: z.object({
      id: z.string(),
      timestamp: z.number().int().positive(),
    }),
    blog: Blog,
  }),
  z.object({
    content: NpfContentBlock.array(),
    layout: NpfLayoutBlock.array(),
    brokenBlog: z.object({
      name: z.string(),
    }),
    post: z.object({}),
  }),
]);
export type ReblogTrail = z.infer<typeof ReblogTrail>;

export const NpfPost = z.object({
  objectType: z.literal("post"),
  blogName: z.string(),
  blog: Blog,
  idString: z.string(),
  postUrl: z.string().url(),
  timestamp: z.number().int().positive(),
  reblogKey: z.string(),
  tags: z.string().array(),
  content: NpfContentBlock.array(),
  layout: NpfLayoutBlock.array(),
  trail: ReblogTrail.array(),
  rebloggedRootId: z.string().optional(),
  rebloggedRootUrl: z.string().url().optional(),
});
export type NpfPost = z.infer<typeof NpfPost>;
