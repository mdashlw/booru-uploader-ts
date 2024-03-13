import { setTimeout } from "node:timers";

export const lazyInit = <T, Args extends any[]>(
  fn: (...args: Args) => Promise<T | { value: T; ttlSeconds?: number }>,
) => {
  let prom: T | undefined = undefined;

  return async (...args: Args) => {
    if (prom !== undefined) {
      return prom;
    }

    const ret = await fn(...args);

    if (typeof ret === "object" && ret !== null && "value" in ret) {
      prom = ret.value;

      if (ret.ttlSeconds) {
        setTimeout(() => {
          prom = undefined;
        }, ret.ttlSeconds * 1_000).unref();
      }
    } else {
      prom = ret;
    }

    return prom;
  };
};
