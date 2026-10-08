/**
 * Slides and schematics per module (2026-10-08): signed in only, and a
 * Praktikan gets only the modules they did a practicum of. Run through the
 * real handler with the database replaced by one canned result.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let baris: unknown[] = [];
let sesiKini: { nim: string; role: "asisten" | "praktikan" } | null = null;
let diikuti: number[] = [];

function chain(): unknown {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit"]) p[m] = () => p;
  p.then = (ok: (v: unknown) => unknown) => ok(baris);
  return p;
}

vi.mock("../../src/lib/db", () => ({ getDb: () => ({ select: () => chain() }) }));
vi.mock("../../src/lib/akses", () => ({ modulDiikuti: async () => diikuti }));
vi.mock("../_lib/siaran", () => ({ denganSiaran: (_t: string, h: unknown) => h }));
vi.mock("../_lib/session", () => ({
  tolakPraktikanTot: async () => false,
  requireAnyRole: (
    _req: unknown,
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => {
    if (!sesiKini) res.status(401).json({ ok: false, kode: "belum_masuk" });
    return sesiKini;
  },
  requireRole: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    if (sesiKini?.role !== "asisten") res.status(401).json({ ok: false, kode: "belum_masuk" });
    return sesiKini?.role === "asisten" ? sesiKini : null;
  },
}));

const { default: handler } = await import("../presentasi/[aksi]");

async function get(aksi: string) {
  const res = {
    code: 200,
    body: undefined as unknown,
    status(n: number) {
      res.code = n;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader() {},
  };
  await handler({ method: "GET", query: { aksi }, headers: {} } as never, res as never);
  return res as { code: number; body: { ok: boolean; aktif?: Record<string, unknown> } };
}

const deck = (modul: number | null, jenis: "berkas" | "tautan") => ({
  modul,
  url: `https://x/${modul}-${jenis}`,
  namaBerkas: `M${modul} ${jenis}`,
  jenis,
});

beforeEach(() => {
  baris = [
    deck(1, "tautan"),
    deck(1, "berkas"),
    deck(2, "berkas"),
    deck(3, "tautan"),
    deck(null, "berkas"),
  ];
  sesiKini = null;
  diikuti = [];
});

describe("GET /api/presentasi/slides and /schematics", () => {
  it("turns a guest away from both", async () => {
    expect((await get("slides")).code).toBe(401);
    expect((await get("schematics")).code).toBe(401);
  });

  it("gives a Praktikan only the modules they did a practicum of", async () => {
    sesiKini = { nim: "1301", role: "praktikan" };
    diikuti = [1, 3];
    const r = await get("slides");
    expect(Object.keys(r.body.aktif ?? {}).sort()).toEqual(["1", "3"]);
    const s = await get("schematics");
    expect(Object.keys(s.body.aktif ?? {}).sort()).toEqual(["1", "3"]);
  });

  it("gives a Praktikan nothing before their first practicum", async () => {
    sesiKini = { nim: "1301", role: "praktikan" };
    expect((await get("slides")).body.aktif).toEqual({});
  });

  it("gives an Asisten every module, the PDF first, and skips decks with no module", async () => {
    sesiKini = { nim: "1010", role: "asisten" };
    const a = (await get("slides")).body.aktif as Record<
      string,
      { jenis: string; pilihan: { jenis: string }[] }
    >;
    expect(Object.keys(a).sort()).toEqual(["1", "2", "3"]);
    expect(a["1"].jenis).toBe("berkas");
    expect(a["1"].pilihan.map((p) => p.jenis)).toEqual(["berkas", "tautan"]);
  });

  it("keeps the deck list for Asisten only", async () => {
    sesiKini = { nim: "1301", role: "praktikan" };
    expect((await get("slides-list")).code).toBe(401);
  });
});
