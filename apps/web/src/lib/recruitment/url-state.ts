/**
 * A sub-tab kept in the address (?cut=wawancara), so a refresh, the back
 * button and a link sent to another Panitia land on the same place. It
 * changes in place with replaceState like the panel's own `bagian`. Only the
 * components that mount after the page has loaded its data use it, so it can
 * read the address in the initial state (the Bank and the Tes tab do the same).
 */
import { useCallback, useState } from "react";

export function useUrlState<T extends string>(
  key: string,
  initial: T,
  allowed: readonly T[],
): [T, (to: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof location === "undefined") return initial;
    const q = new URLSearchParams(location.search).get(key);
    return q !== null && (allowed as readonly string[]).includes(q) ? (q as T) : initial;
  });
  const set = useCallback(
    (to: T) => {
      setValue(to);
      const u = new URL(location.href);
      if (to === initial) u.searchParams.delete(key);
      else u.searchParams.set(key, to);
      history.replaceState(history.state, "", u);
    },
    [key, initial],
  );
  return [value, set];
}

/**
 * Free text kept in the address (?q=raka), the same way: replaceState, read
 * once at mount. An empty text removes the key so the address stays short.
 */
export function useUrlText(key: string): [string, (to: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof location === "undefined") return "";
    return new URLSearchParams(location.search).get(key) ?? "";
  });
  const set = useCallback(
    (to: string) => {
      setValue(to);
      const u = new URL(location.href);
      if (to.trim() === "") u.searchParams.delete(key);
      else u.searchParams.set(key, to);
      history.replaceState(history.state, "", u);
    },
    [key],
  );
  return [value, set];
}
