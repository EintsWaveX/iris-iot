/**
 * The links Preparation accepts instead of an upload (Phase 9 Stage 3).
 * Browser-safe: the editor checks as you type, and api/presentasi checks
 * again before saving.
 *
 * Slides take a Canva design link. Schematics take a Wokwi project, a
 * Tinkercad circuit, a Canva design, or a direct https image address. Each
 * share link is turned into the address that may sit in a frame (the CSP
 * `frame-src` in vercel.json lists the same three hosts):
 *
 * - Canva: /design/<id>/<key>/view (or /watch) -> .../view?embed. An /edit
 *   link only works for people signed in to the design, so it is refused
 *   with its own reason. Canva's Share button now also gives a short public
 *   link, canva.link/<code> (2026-10-07): it passes here marked `pendek`,
 *   and the server follows it to its /design/.../view address before saving
 *   (a browser can't read another site's redirect).
 * - Wokwi: /projects/<id> frames as it is.
 * - Tinkercad: /things/<id>[-slug][/edit] -> /embed/<id> (the /things page
 *   refuses frames).
 */

export type JenisTautan = "canva" | "wokwi" | "tinkercad" | "gambar";

export type HasilTautan =
  | { ok: true; jenis: JenisTautan; url: string; pendek?: true }
  | { ok: false; kode: "bukan_tautan" | "canva_edit" | "tidak_didukung" | "canva_pendek" };

export const TAUTAN_SLIDES: readonly JenisTautan[] = ["canva"];
export const TAUTAN_SKEMA: readonly JenisTautan[] = ["wokwi", "tinkercad", "canva", "gambar"];

const MAX_LEN = 500;
const GAMBAR = /\.(png|jpe?g|webp|gif|svg)$/i;

function canva(u: URL): HasilTautan | null {
  if (u.hostname !== "www.canva.com" && u.hostname !== "canva.com") return null;
  const m = /^\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/(view|watch|edit)\/?$/.exec(
    u.pathname,
  );
  if (!m) return { ok: false, kode: "tidak_didukung" };
  if (m[3] === "edit") return { ok: false, kode: "canva_edit" };
  const key = m[2] ? `/${m[2]}` : "";
  return { ok: true, jenis: "canva", url: `https://www.canva.com/design/${m[1]}${key}/view?embed` };
}

/** Canva's short share link; the server resolves it (bukaTautanPendek). */
function canvaPendek(u: URL): HasilTautan | null {
  if (u.hostname !== "canva.link" && u.hostname !== "www.canva.link") return null;
  if (!/^\/[A-Za-z0-9_-]{4,40}\/?$/.test(u.pathname)) return { ok: false, kode: "tidak_didukung" };
  return {
    ok: true,
    jenis: "canva",
    url: `https://canva.link${u.pathname.replace(/\/$/, "")}`,
    pendek: true,
  };
}

function wokwi(u: URL): HasilTautan | null {
  if (u.hostname !== "wokwi.com" && u.hostname !== "www.wokwi.com") return null;
  const m = /^\/projects\/(\d{6,24})\/?$/.exec(u.pathname);
  if (!m) return { ok: false, kode: "tidak_didukung" };
  return { ok: true, jenis: "wokwi", url: `https://wokwi.com/projects/${m[1]}` };
}

function tinkercad(u: URL): HasilTautan | null {
  if (u.hostname !== "www.tinkercad.com" && u.hostname !== "tinkercad.com") return null;
  const m = /^\/(?:things|embed)\/([A-Za-z0-9]{6,20})(?:-[^/]*)?(?:\/edit)?\/?$/.exec(u.pathname);
  if (!m) return { ok: false, kode: "tidak_didukung" };
  return { ok: true, jenis: "tinkercad", url: `https://www.tinkercad.com/embed/${m[1]}` };
}

/** Reads a pasted link; `boleh` is what this place accepts. */
export function bacaTautan(raw: string, boleh: readonly JenisTautan[]): HasilTautan {
  const s = raw.trim();
  if (!s || s.length > MAX_LEN) return { ok: false, kode: "bukan_tautan" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, kode: "bukan_tautan" };
  }
  if (u.protocol !== "https:" || u.username || u.password)
    return { ok: false, kode: "bukan_tautan" };
  for (const f of [canva, canvaPendek, wokwi, tinkercad]) {
    const r = f(u);
    if (r) return r.ok && !boleh.includes(r.jenis) ? { ok: false, kode: "tidak_didukung" } : r;
  }
  if (boleh.includes("gambar") && GAMBAR.test(u.pathname)) {
    return { ok: true, jenis: "gambar", url: u.href };
  }
  return { ok: false, kode: "tidak_didukung" };
}

/** True when a saved schematic link shows as a frame, not an image. */
export function tautanBingkai(url: string): boolean {
  const r = bacaTautan(url, TAUTAN_SKEMA);
  return r.ok && r.jenis !== "gambar";
}

/** The site's own name for a saved link, for labels. */
export function namaLayanan(url: string): string {
  const r = bacaTautan(url, TAUTAN_SKEMA);
  if (!r.ok) return "";
  return {
    canva: "Canva",
    wokwi: "Wokwi",
    tinkercad: "Tinkercad",
    gambar: new URL(r.url).hostname,
  }[r.jenis];
}
