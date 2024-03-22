import { Blob } from "node:buffer";
import { IncomingHttpHeaders } from "undici/types/header.js";
import {
  ProbeResult,
  probeImageBlob,
  probeImageUrl,
} from "../utils/probe-image.js";

export function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "UTC",
  });
}

export async function probeAndValidateImageBlob(
  blob: Blob,
  type?: string,
  width?: number,
  height?: number,
): Promise<ProbeResult> {
  return validateProbeResult(await probeImageBlob(blob), type, width, height);
}

export async function probeAndValidateImageUrl(
  url: string | URL,
  type?: string,
  width?: number,
  height?: number,
  headers?: IncomingHttpHeaders,
): Promise<ProbeResult> {
  return validateProbeResult(
    await probeImageUrl(url, headers),
    type,
    width,
    height,
  );
}

function validateProbeResult(
  result: ProbeResult,
  type?: string,
  width?: number,
  height?: number,
): ProbeResult {
  if (type?.startsWith("image/")) {
    type = type.substring("image/".length);
  }

  if (type === "jpeg") {
    type = "jpg";
  }

  if (type !== undefined && result.type !== type) {
    throw new Error(
      `Unexpected image type: "${result.type}" (expected "${type}")`,
    );
  }

  if (
    (width !== undefined && result.width !== width) ||
    (height !== undefined && result.height !== height)
  ) {
    throw new Error(
      `Unexpected image size: ${result.width}x${result.height} (expected ${width}x${height})`,
    );
  }

  return result;
}
