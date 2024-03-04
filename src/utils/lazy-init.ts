export const lazyInit = <T, Args extends any[]>(fn: (...args: Args) => T) => {
  let prom: T | undefined = undefined;
  return (...args: Args) => (prom = prom ?? fn(...args));
};
