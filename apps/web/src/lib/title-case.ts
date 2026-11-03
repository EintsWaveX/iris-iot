/**
 * Title Case for interface labels, the same rule as the mockup's `P9.title`
 * (round 3 ruling: buttons, chips, tabs, menu items and dropdowns read in
 * Title Case, not only headers). Small joining words stay lower case unless
 * they start the text or follow a colon, dot or a dot between the words.
 * Chinese text, and words with digits, slashes, underscores or dots, are left alone.
 */
const JOIN = new Set([
  "dan",
  "di",
  "ke",
  "dari",
  "per",
  "untuk",
  "atau",
  "yang",
  "dengan",
  "pada",
  "oleh",
  "bagi",
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "vs",
]);

export function titleCase(str: string): string {
  if (typeof str !== "string" || /[㐀-鿿]/.test(str)) return str;
  let first = true;
  return str.replace(/[^\s]+/g, (w) => {
    const lead = first;
    first = /[:·.!?]$/.test(w) || w === "·";
    const m = w.match(/^(["'“(]*)([a-zà-ɏ][a-zà-ɏ'’]*)(.*)$/);
    if (!m || /[0-9_@/]/.test(w) || /^[a-z]+[.][a-z0-9]/.test(m[2] + m[3])) return w;
    if (!lead && JOIN.has(m[2])) return w;
    return m[1] + m[2][0].toUpperCase() + m[2].slice(1) + m[3];
  });
}
