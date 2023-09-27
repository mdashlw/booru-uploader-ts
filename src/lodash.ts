import _ from "lodash";

// https://github.com/lodash/lodash/issues/4815
export function debounceAsync<F extends (...args: any[]) => Promise<any>>(
  func: F,
  wait?: number,
) {
  const debounced = _.debounce(
    (resolve, reject, thisArg, args: Parameters<F>) => {
      func.call(thisArg, ...args).then(resolve, reject);
    },
    wait,
  );
  return function (this: any, ...args: Parameters<F>): ReturnType<F> {
    return new Promise((resolve, reject) => {
      debounced(resolve, reject, this, args);
    }) as ReturnType<F>;
  };
}
