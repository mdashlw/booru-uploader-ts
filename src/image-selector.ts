import inquirer from "inquirer";
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

  const { image } = await inquirer.prompt({
    type: "list",
    name: "image",
    message: "Image",
    choices: source.images.map((image, index) => ({
      name: `#${index + 1}`,
      value: image,
    })),
    loop: false,
  });

  return image as SourceImageData;
}
