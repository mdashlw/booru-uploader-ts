import undici from "undici";

const contentTypeMap: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export default async function probeImageType(
  url: string | URL,
  headers?: Record<string, string>,
): Promise<string> {
  const response = await undici.request(url, {
    method: "HEAD",
    headers,
    throwOnError: true,
  });
  let contentType = response.headers["content-type"];

  if (!contentType) {
    throw new Error(`No content type header for ${url}`);
  }

  if (typeof contentType !== "string") {
    throw new Error(`Unexpected content type header ${contentType} for ${url}`);
  }

  if (contentType.includes(";")) {
    contentType = contentType.substring(0, contentType.indexOf(";"));
  }

  const imageType = contentTypeMap[contentType];

  if (!imageType) {
    throw new Error(`Unknown content type ${contentType} for ${url}`);
  }

  return imageType;
}
