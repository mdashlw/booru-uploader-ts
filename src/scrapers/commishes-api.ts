import undici from "undici";
import z from "zod";
import { SourceData } from "../scraper/types.js";
import { formatDate } from "../scraper/utils.js";
import probeImageSize from "../utils/probe-image-size.js";

const Upload = z.object({
  id: z.number().int().positive(),
  created: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
  title: z.string().nullable(),
  description: z.string().nullable(),
  media: z.object({
    o: z.string().url(),
  }),
  author: z.object({
    id: z.number().int().positive(),
    username: z.string(),
  }),
});
type Upload = z.infer<typeof Upload>;

const Auction = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  media: z.object({
    original: z.string().url(),
  }),
});
type Auction = z.infer<typeof Auction>;

const AuctionExtended = z.object({
  id: z.number().int().positive(),
  url: z.string().startsWith("/"),
  userName: z.string(),
  started: z
    .number()
    .int()
    .positive()
    .transform((ts) => ts * 1_000)
    .pipe(z.coerce.date()),
});
type AuctionExtended = z.infer<typeof AuctionExtended>;

export function canHandle(url: URL): boolean {
  return (
    (url.hostname === "portfolio.commishes.com" &&
      url.pathname.startsWith("/upload/show/")) ||
    (url.hostname === "ych.commishes.com" &&
      url.pathname.startsWith("/auction/show/"))
  );
}

export async function scrape(url: URL): Promise<SourceData> {
  const objectId = url.pathname.split("/")[3]!;

  if (url.hostname === "ych.commishes.com") {
    const auction = await fetchAuction(objectId);
    const auctionExtended = await fetchAuctionExtended(
      auction.username,
      auction.id,
    );
    const { type, width, height } = await probeImageSize(
      auction.media.original,
    );

    return {
      source: "Commishes",
      url: `https://${url.host}${auctionExtended.url}`,
      images: [
        {
          url: auction.media.original,
          type,
          width,
          height,
        },
      ],
      artist: auction.username,
      date: formatDate(auctionExtended.started),
      title: auction.title,
      description: auction.description?.replaceAll("\r\n", "\n") ?? null,
    };
  } else if (url.hostname === "portfolio.commishes.com") {
    const upload = await fetchUpload(objectId);
    const { type, width, height } = await probeImageSize(upload.media.o);

    return {
      source: "Commishes",
      url: `https://${url.host}/upload/show/${objectId}/`,
      images: [
        {
          url: upload.media.o,
          type,
          width,
          height,
        },
      ],
      artist: upload.author.username,
      date: formatDate(upload.created),
      title: upload.title,
      description: upload.description,
    };
  } else {
    throw new Error("Unknown hostname");
  }
}

async function fetchUpload(uploadId: string): Promise<Upload> {
  const response = await undici
    .request(`https://portfolio.commishes.com/upload/show/${uploadId}.json`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.uploadId = uploadId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.uploadId = uploadId;
    error.response = response;
    throw error;
  });

  return Upload.parse(json);
}

async function fetchAuction(auctionId: string): Promise<Auction> {
  const response = await undici
    .request(`https://ych.commishes.com/auction/show/${auctionId}.json`, {
      throwOnError: true,
    })
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.auctionId = auctionId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.auctionId = auctionId;
    error.response = response;
    throw error;
  });
  const data = z
    .object({
      result: z.literal("200 OK"),
      payload: Auction,
    })
    .parse(json);

  return data.payload;
}

async function fetchAuctionExtended(
  username: string,
  auctionId: number,
): Promise<AuctionExtended> {
  const response = await undici
    .request(
      `https://ych.commishes.com/user/history/${username}.json?until=${
        auctionId + 1
      }&rating=100`,
      {
        throwOnError: true,
      },
    )
    .catch((error) => {
      error = new Error("Failed to fetch", { cause: error });
      error.auctionId = auctionId;
      throw error;
    });
  const json = await response.body.json().catch((error) => {
    error = new Error("Failed to read response body", { cause: error });
    error.auctionId = auctionId;
    error.response = response;
    throw error;
  });
  const data = z
    .object({
      status: z.literal("200 OK"),
      payload: AuctionExtended.array(),
    })
    .parse(json);
  const auction = data.payload.find((a) => a.id === auctionId);

  if (!auction) {
    throw new Error("Auction not found");
  }

  return auction;
}
