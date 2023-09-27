import { select } from "@inquirer/prompts";
import { SourceData, SourceImageData } from "./scraper/types.js";

export default async function selectImage(
  source: SourceData,
): Promise<SourceImageData> {
  if (source.images.length === 0) {
    throw new Error("No images");
  }

  if (source.images.length === 1) {
    return source.images[0];
  }

  const image = await select({
    message: "Image",
    choices: source.images.map((image, index) => ({
      value: image,
      name: `#${index + 1}`,
    })),
  });

  return image;
}
