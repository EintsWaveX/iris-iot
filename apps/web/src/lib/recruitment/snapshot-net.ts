/**
 * Where a reference snapshot may fetch from (EXAM-ENGINE 8.1 step 2). Pure:
 * the address rules and the URL rules; the fetch itself is the API's
 * (api/_lib/recruitment-snapshot.ts), which asks these for the page, for
 * every redirect and for every image, and connects to the address it
 * checked, never to a second lookup of the name.
 */
import { isIP } from "node:net";

export type UrlCheck =
  { ok: true; url: URL } | { ok: false; kode: "url_salah" | "alamat_terlarang" };

/** Names that point inside a network, whatever they resolve to */
const LOCAL_TLD = new Set([
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "arpa",
]);

const v4 = (o: number[]): boolean => {
  const [a, b, c] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
};

/** Eight 16-bit groups of an IPv6 address, or null. An embedded IPv4 tail counts as two groups. */
function groups6(s: string): number[] | null {
  let t = s;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (tail) {
    const o = tail[1].split(".").map(Number);
    if (o.length !== 4 || o.some((x) => !(x >= 0 && x <= 255))) return null;
    t = `${t.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = t.split("::");
  if (halves.length > 2) return null;
  const side = (x: string) => (x === "" ? [] : x.split(":"));
  const head = side(halves[0]);
  const rest = halves.length === 2 ? side(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8) || (halves.length === 2 && fill < 1))
    return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (all.length !== 8) return null;
  const out = all.map((g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

const v4of = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/** True for any address a snapshot must not touch, and for anything that is not an address. */
export function blockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4(ip.split(".").map(Number));
  if (kind !== 6) return true;
  const g = groups6(ip);
  if (!g) return true;
  const [a, b, c, d, e, f, x, y] = g;
  if (g.every((n) => n === 0)) return true; // ::
  if (g.slice(0, 7).every((n) => n === 0) && x === 0 && y === 1) return true; // ::1
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return true; // link local, site local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0) return true; // Teredo
  if (a === 0x2001 && b === 0xdb8) return true; // documentation
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // discard 100::/64
  // An IPv4 address inside an IPv6 one is judged as the IPv4 address.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return v4(v4of(x, y)); // ::ffff:0:0/96
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) return v4(v4of(x, y)); // ::/96
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return v4(v4of(x, y)); // NAT64
  if (a === 0x64 && b === 0xff9b && c === 1) return true; // local NAT64 64:ff9b:1::/48
  if (a === 0x2002) return v4(v4of(b, c)); // 6to4
  return false;
}

/** A page address a snapshot may be fetched from, without its fragment. */
export function checkUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, kode: "url_salah" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, kode: "url_salah" };
  if (u.username || u.password) return { ok: false, kode: "url_salah" };
  if (u.port !== "" && u.port !== "80" && u.port !== "443") return { ok: false, kode: "url_salah" };
  u.hash = "";
  const host = u.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (isIP(host))
    return blockedAddress(host) ? { ok: false, kode: "alamat_terlarang" } : { ok: true, url: u };
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253 || LOCAL_TLD.has(labels[labels.length - 1]))
    return { ok: false, kode: "alamat_terlarang" };
  return { ok: true, url: u };
}
