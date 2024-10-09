import { Blob } from "node:buffer";
import type { IncomingHttpHeaders } from "undici/types/header.ts";
import {
  type ProbeResult,
  probeImageBlob,
  probeImageUrl,
} from "../utils/probe-image.ts";

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
  size?: number,
): Promise<ProbeResult> {
  return validateProbeResult(
    await probeImageBlob(blob),
    type,
    width,
    height,
    size,
  );
}

export async function probeAndValidateImageUrl(
  url: string | URL,
  type?: string,
  width?: number,
  height?: number,
  headers?: IncomingHttpHeaders,
  size?: number,
): Promise<ProbeResult> {
  return validateProbeResult(
    await probeImageUrl(url, headers),
    type,
    width,
    height,
    size,
  );
}

function validateProbeResult(
  result: ProbeResult,
  type?: string,
  width?: number,
  height?: number,
  size?: number,
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

  if (size !== undefined && result.blob.size !== size) {
    throw new Error(
      `Unexpected image size: ${result.blob.size} bytes (expected ${size} bytes)`,
    );
  }

  return result;
}
