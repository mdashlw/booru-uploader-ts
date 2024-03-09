import { imageSize } from "image-size";
import { Blob, Buffer } from "node:buffer";
import undici from "undici";
import { IncomingHttpHeaders } from "undici/types/header.js";

export type ProbeResult = {
  blob: Blob;
  type: string;
  width: number;
  height: number;
};

export async function probeImageBlob(blob: Blob): Promise<ProbeResult> {
  const result = imageSize(Buffer.from(await blob.arrayBuffer()));

  if (
    result.type === undefined ||
    result.width === undefined ||
    result.height === undefined
  ) {
    throw new Error(`Failed to probe image - ${JSON.stringify(result)}`);
  }

  if ((result.orientation ?? 0) >= 5) {
    const { width, height } = result;
    result.width = height;
    result.height = width;
  }

  return {
    blob,
    type: result.type,
    width: result.width,
    height: result.height,
  };
}

export async function probeImageUrl(
  url: string | URL,
  headers?: IncomingHttpHeaders,
): Promise<ProbeResult> {
  const response = await undici.request(url, {
    headers,
    maxRedirections: 10,
    throwOnError: true,
  });
  const blob = await response.body.blob();
  const result = await probeImageBlob(blob);

  return {
    ...result,
    blob,
  };
}
