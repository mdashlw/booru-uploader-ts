import { select } from "@inquirer/prompts";
import type { SourceData, SourceImageData } from "./scraper/types.ts";

export default async function selectImage(
  source: SourceData,
  isPrimary: true,
): Promise<SourceImageData>;

export default async function selectImage(
  source: SourceData,
  isPrimary?: false,
): Promise<SourceImageData | null>;

export default async function selectImage(
  source: SourceData,
  isPrimary = false,
) {
  if (source.images.length === 0) {
    if (isPrimary) {
      throw new Error("No images");
    }

    return null;
  }

  if (source.images.length === 1) {
    const [image] = source.images;
    image.selected = true;
    return image;
  }

  if (source.images.some((i) => i.selected)) {
    return source.images.find((i) => i.selected)!;
  }

  const image = await select({
    message: isPrimary ? "Primary image" : `${source.source} (${source.url})`,
    choices: source.images.map((image, index) => ({
      value: image,
      name: `#${index + 1}`,
    })),
  });

  image.selected = true;
  return image;
}
