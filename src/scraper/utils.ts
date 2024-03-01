import { ProbeResult, probeImageUrl } from "../utils/probe-image.js";

export function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
}

export async function probeAndValidateImageUrl(
  url: string,
  type?: string,
  width?: number,
  height?: number,
): Promise<ProbeResult> {
  const result = await probeImageUrl(url);

  if (type?.startsWith("image/")) {
    type = type.substring("image/".length);
  }

  if (type === "jpeg") {
    type = "jpg";
  }

  if (type !== undefined && result.type !== type) {
    throw new Error(
      `Unexpected image type: "${result.type}" (expected "${type}") for ${url}`,
    );
  }

  if (
    (width !== undefined && result.width !== width) ||
    (height !== undefined && result.height !== height)
  ) {
    throw new Error(
      `Unexpected image size: ${result.width}x${result.height} (expected ${width}x${height}) for ${url}`,
    );
  }

  return result;
}
