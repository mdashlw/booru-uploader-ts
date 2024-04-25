import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

export async function readableToBuffer(readable: Readable): Promise<Buffer> {
  return Buffer.concat(await Array.fromAsync(readable));
}
