import Keyv from "keyv";
import { TumblrPost } from "./api.js";

export const keyv = new Keyv<Record<string, TumblrPost>>(
  "sqlite://tumblr-archives.db",
  {
    iterationLimit: 100_000,
  },
);
