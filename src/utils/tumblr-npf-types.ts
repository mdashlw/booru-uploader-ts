import { z } from "zod";

export const NpfMediaObject = z.object({
  url: z.string().url(),
  type: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
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
      url: z.string().url(),
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
