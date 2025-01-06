import type { SourceData } from "./scraper/types.ts";
import crypto from "node:crypto";
import sharp from "sharp";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default async function printSourceImages(sources: SourceData[]) {
  console.log("\n");
  console.table(
    (
      await Promise.all(
        sources.flatMap((source) =>
          (source.images.some((i) => i.selected)
            ? source.images.filter((i) => i.selected)
            : source.images
          ).map(async (image) => ({
            source: `${source.source} #${source.images.indexOf(image) + 1}`,
            width: image.width,
            height: image.height,
            type: image.type,
            size: image.blob ? formatBytes(image.blob.size) : "",
            bytes: image.blob?.size,
            hash: !image.blob
              ? undefined
              : crypto
                  .createHash("md5")
                  .update(
                    await sharp(await image.blob.arrayBuffer())
                      .ensureAlpha()
                      .raw()
                      .toBuffer(),
                  )
                  .digest("hex"),
          })),
        ),
      )
    ).map((row, _index, rows) => ({
      ...row,
      uniq: "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[
        Array.from(new Set(rows.map((r) => r.hash))).indexOf(row.hash)
      ].repeat(3),
    })),
  );
  console.log("\n");
}
