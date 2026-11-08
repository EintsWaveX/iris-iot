/**
 * vercel.json, applied by the self-hosted server.
 *
 * The file stays the one place that says which paths redirect, which API
 * paths are rewritten and which headers go on every answer, so the site
 * answers the same on Vercel and on the PC. This module only reads it: a
 * rule here is never written by hand a second time.
 *
 * Vercel's `source` is path-to-regexp. The file uses three shapes, all
 * handled below: a literal path, a raw regular-expression group such as
 * `/((?!api/).*)` or `/zh/(.*)` (read back as `$1`), and a named tail such
 * as `/api/sesi/:path*` (read back as `:path*`). Anything else in a rule
 * makes `compileRules` throw at start-up, so an unsupported rule can never
 * be silently skipped (the parity test pins this too).
 */

export interface VercelRule {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: { type: string; value?: string; key?: string }[];
}

export interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface VercelConfig {
  redirects?: VercelRule[];
  rewrites?: VercelRule[];
  headers?: VercelHeaderRule[];
  functions?: Record<string, { maxDuration?: number }>;
}

/** A `source` as an anchored regular expression. Throws on a shape it does not know. */
export function sumberKeRegex(source: string): RegExp {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "(") {
      // A raw group, copied as is (it may nest, e.g. a lookahead inside).
      let kedalaman = 0;
      let j = i;
      for (; j < source.length; j++) {
        if (source[j] === "\\") {
          j++;
          continue;
        }
        if (source[j] === "(") kedalaman++;
        else if (source[j] === ")" && --kedalaman === 0) break;
      }
      if (kedalaman !== 0) throw new Error(`vercel.json: unbalanced group in "${source}"`);
      out += source.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === ":") {
      const m = /^\/:([A-Za-z_]\w*)([*+?]?)/.exec(source.slice(i));
      if (!m) throw new Error(`vercel.json: cannot read "${source}"`);
      const [semua, nama, tanda] = m;
      out +=
        tanda === "*"
          ? `(?:/(?<${nama}>.*))?`
          : tanda === "+"
            ? `/(?<${nama}>.+)`
            : tanda === "?"
              ? `(?:/(?<${nama}>[^/]+))?`
              : `/(?<${nama}>[^/]+)`;
      i += semua.length - 1;
      continue;
    }
    if (c === ":" || c === "*" || c === "+" || c === "?" || c === "{" || c === "}") {
      throw new Error(`vercel.json: "${c}" in "${source}" is not supported`);
    }
    out += c.replace(/[.\\^$|[\]]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** The destination with `$1` and `:name` (or `:name*`) filled in from the match. */
export function isiTujuan(tujuan: string, m: RegExpExecArray): string {
  const nama = m.groups ?? {};
  return tujuan
    .replace(/\$(\d+)/g, (_, n: string) => m[Number(n)] ?? "")
    .replace(/:([A-Za-z_]\w*)\*?/g, (semua, k: string) => (k in nama ? (nama[k] ?? "") : semua));
}

interface Terkompilasi<T> {
  re: RegExp;
  aturan: T;
}

export interface Aturan {
  /** A redirect for this host, path and query, or null. */
  alihkan(host: string, path: string, query: string): { status: 307 | 308; lokasi: string } | null;
  /** The path after rewrites (`/api/agen` becomes `/api/agent`); the input when none matches. */
  tulisUlang(path: string): string;
  /** The headers vercel.json puts on this path, in file order (a later one wins). */
  header(path: string): [string, string][];
  /** The longest a function for this route file may run, in seconds, when set. */
  durasiMaks(berkasApi: string): number | undefined;
}

function cocokHost(has: VercelRule["has"], host: string): boolean {
  if (!has || has.length === 0) return true;
  return has.every((h) => {
    // Only host conditions exist today; any other kind never matches, and
    // the parity test fails if one is added, so it cannot go unnoticed.
    if (h.type !== "host") return false;
    return host === (h.value ?? "").toLowerCase();
  });
}

export function compileRules(config: VercelConfig): Aturan {
  const alih: Terkompilasi<VercelRule>[] = (config.redirects ?? []).map((a) => ({
    re: sumberKeRegex(a.source),
    aturan: a,
  }));
  const tulis: Terkompilasi<VercelRule>[] = (config.rewrites ?? []).map((a) => ({
    re: sumberKeRegex(a.source),
    aturan: a,
  }));
  const kepala: Terkompilasi<VercelHeaderRule>[] = (config.headers ?? []).map((a) => ({
    re: sumberKeRegex(a.source),
    aturan: a,
  }));

  return {
    alihkan(host, path, query) {
      const h = host.toLowerCase().replace(/:\d+$/, "");
      for (const { re, aturan } of alih) {
        if (!cocokHost(aturan.has, h)) continue;
        const m = re.exec(path);
        if (!m) continue;
        let lokasi = isiTujuan(aturan.destination, m);
        // Vercel carries the query along unless the destination has its own.
        if (query && !lokasi.includes("?")) lokasi += query;
        return { status: aturan.permanent ? 308 : 307, lokasi };
      }
      return null;
    },
    tulisUlang(path) {
      for (const { re, aturan } of tulis) {
        const m = re.exec(path);
        if (m) return isiTujuan(aturan.destination, m).replace(/\/+$/, "") || "/";
      }
      return path;
    },
    header(path) {
      const out: [string, string][] = [];
      for (const { re, aturan } of kepala) {
        if (re.test(path)) for (const k of aturan.headers) out.push([k.key, k.value]);
      }
      return out;
    },
    durasiMaks(berkasApi) {
      return config.functions?.[berkasApi]?.maxDuration;
    },
  };
}
