import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

export async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of readable) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
