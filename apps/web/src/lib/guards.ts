/**
 * A plain object (not null, not an array): the first check every validator in
 * `lib/` runs on parsed JSON before it reads a field. One copy here instead of
 * a private one in each file.
 */
export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
