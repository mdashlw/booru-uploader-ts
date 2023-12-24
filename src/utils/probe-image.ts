import { imageSize } from "image-size";
import undici from "undici";
import { Blob, Buffer } from "node:buffer";
import { IncomingHttpHeaders } from "undici/types/header.js";

export type ProbeResult = {
  type: string;
  width: number;
  height: number;
};

export type ProbeResultWithBlob = ProbeResult & { blob: Blob };

export async function probeImageBlob(blob: Blob): Promise<ProbeResult> {
  const result = imageSize(Buffer.from(await blob.arrayBuffer()));

  if (
    result.type === undefined ||
    result.width === undefined ||
    result.height === undefined
  ) {
    throw new Error(`Failed to probe image - ${JSON.stringify(result)}`);
  }

  return {
    type: result.type,
    width: result.width,
    height: result.height,
  };
}

export async function probeImageUrl(
  url: string | URL,
  headers?: IncomingHttpHeaders,
): Promise<ProbeResultWithBlob> {
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
