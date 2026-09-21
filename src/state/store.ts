/**
 * The smallest store that works: a value, a setter, and a hook. Every slice
 * of app state is one of these; nothing is a deep reactive tree.
 */
import { useSyncExternalStore } from "react";

export function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  const get = () => value;
  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    subs.forEach((fn) => fn());
  };
  const subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };
  const use = <S = T>(select: (v: T) => S = (v) => v as unknown as S) =>
    useSyncExternalStore(subscribe, () => select(value), () => select(value));
  return { get, set, subscribe, use };
}
