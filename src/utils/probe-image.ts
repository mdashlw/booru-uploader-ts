import { parse as parseContentDisposition } from "@tinyhttp/content-disposition";
import { imageSize } from "image-size";
import { Blob, Buffer } from "node:buffer";
import undici from "undici";
import type { IncomingHttpHeaders } from "undici/types/header.ts";

export type ProbeResult = {
  blob: Blob;
  filename: string | undefined;
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
    filename: undefined,
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

  const contentDisposition = response.headers["content-disposition"];

  if (
    contentDisposition !== undefined &&
    typeof contentDisposition === "string" &&
    contentDisposition !== "\x00\x00"
  ) {
    result.filename = parseContentDisposition(contentDisposition).parameters
      .filename as string | undefined;
  } else {
    result.filename = (response.context as { history: URL[] }).history
      .at(-1)!
      .pathname.split("/")
      .pop();
  }

  return result;
}

export async function probeImageUrls(urls: string[]) {
  for (const url of urls) {
    try {
      return await probeImageUrl(url);
    } catch (error: any) {
      if (
        error.code === "UND_ERR_RESPONSE_STATUS_CODE" &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to probe urls");
}
