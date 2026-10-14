/**
 * Live updates stay complete (2026-10-07): every write a route accepts is
 * listed in src/lib/siaran-topik.ts, every listed write still exists, and
 * every topic a write sends has a page listening to it. Before this a write
 * missing from the list sent its route's name, which no page heard.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOPIK, TOPIK_TULIS } from "../../../src/lib/siaran-topik.js";

const WEB = resolve(__dirname, "..", "..", "..");

/** Read-only actions: they answer GET only and never broadcast. */
const BACA: Record<string, string[]> = {
  session: [
    "aliran",
    "asisten",
    "audit",
    "beranda",
    "current",
    "jurnal",
    "lab",
    "laporan",
    "mine",
    "now",
    "perburuan",
    "results",
    "riwayat",
    "waspada",
  ],
  modul: ["draft", "kode", "kode-edit", "kunci", "unduh"],
  presentasi: ["pin", "schematic-list", "schematics", "slides", "slides-list"],
  auth: ["me"],
  tp: [
    "berkas",
    "hitung",
    "kelompok",
    "lampiran",
    "lms-info",
    "riwayat",
    "modul",
    "praktikan",
    "praktikum",
    "saya",
  ],
  // Phase 15: the LMS menu's reads (tugas, nilai, umum, kalender and materi
  // are both a read and a write, so they're listed as writes).
  lms: ["kelas", "kelas-isi", "log", "ringkas"],
};

const RUTE: Record<string, string> = {
  session: "api/session/[aksi].ts",
  modul: "api/modul/[aksi].ts",
  presentasi: "api/presentasi/[aksi].ts",
  auth: "api/auth/[aksi].ts",
  tp: "api/tp/[aksi].ts",
  lms: "api/lms/[aksi].ts",
};

/** Every action name a route dispatches on: `aksi === "x"` comparisons and
 *  the keys of its handler tables. */
function aksiDari(file: string): Set<string> {
  const src = readFileSync(join(WEB, file), "utf8");
  const out = new Set<string>();
  for (const m of src.matchAll(/aksi\s*===\s*"([a-z0-9-]+)"/g)) out.add(m[1]);
  for (const m of src.matchAll(/^\s*"([a-z0-9-]+)":\s*handle\w+,$/gm)) out.add(m[1]);
  out.delete("string"); // typeof aksi === "string"
  return out;
}

function sumber(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sumber(p);
    return /\.(tsx?|astro)$/.test(e.name) && !e.name.includes(".test.") ? [p] : [];
  });
}

describe("siaran topics", () => {
  it("lists every write each route accepts, and nothing it doesn't", () => {
    const hilang: string[] = [];
    const basi: string[] = [];
    for (const [rute, file] of Object.entries(RUTE)) {
      const ada = aksiDari(file);
      for (const a of ada) {
        if (!BACA[rute].includes(a) && !(`${rute}:${a}` in TOPIK_TULIS))
          hilang.push(`${rute}:${a}`);
      }
      for (const k of Object.keys(TOPIK_TULIS)) {
        const [r, a] = k.split(":");
        if (r === rute && a && !ada.has(a)) basi.push(k);
      }
      for (const a of BACA[rute]) if (!ada.has(a)) basi.push(`${rute}:${a} (BACA)`);
    }
    expect(hilang, "add these writes to src/lib/siaran-topik.ts").toEqual([]);
    expect(basi, "these listed actions no longer exist").toEqual([]);
  });

  it("covers the routes without an action", () => {
    for (const r of ["session", "server", "action"]) expect(TOPIK_TULIS[r]).toBeDefined();
  });

  it("uses topic names the relay accepts", () => {
    for (const t of TOPIK) expect(t).toMatch(/^[a-z]{2,16}$/);
  });

  it("has a page listening to every topic", () => {
    // Subscriptions name their topics as string literals next to
    // useSiaran, useSegar, usePoll or dengar; a topic named nowhere in src is unheard.
    const teks = sumber(join(WEB, "src"))
      .filter((f) => !f.endsWith("siaran-topik.ts"))
      .map((f) => readFileSync(f, "utf8"))
      .filter((s) => /\b(useSiaran|useSegar|usePoll|dengar|useSessionNow)\b/.test(s))
      .join("\n");
    const tuli = TOPIK.filter((t) => !new RegExp(`["']${t}["']`).test(teks));
    expect(tuli, "topics no page subscribes to").toEqual([]);
  });
});
