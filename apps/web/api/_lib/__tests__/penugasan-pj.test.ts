/**
 * Phase 18 Task 7: the Jadwal drawer's Person in Charge. `pj` must be one of
 * the slot's own default Asisten (as this same save leaves them) or null;
 * it is saved and rides the `jadwal_ubah` audit detail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<unknown, unknown[]>();
const audit: { aktor: string; aksi: string; detail: unknown }[] = [];
let tersimpan: Record<string, unknown> | null = null;

function chain(tabel?: unknown): unknown {
  const st = { tabel };
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "set", "values"]) p[m] = () => p;
  p.from = (t: unknown) => {
    st.tabel = t;
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(data.get(st.tabel) ?? []);
  return p;
}

const db = {
  select: () => chain(),
  update: () => chain(),
  insert: () => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoUpdate: (o: { set: Record<string, unknown> }) => ({
        returning: async () => {
          tersimpan = o.set;
          return [{ id: 7, hari: 4, slot: 3, jumlahKelompok: 5, asisten: [], ...v, ...o.set }];
        },
      }),
    }),
  }),
};

vi.mock("../../../src/lib/db", () => ({ getDb: () => db }));
vi.mock("../../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (aktor: string, aksi: string, detail: unknown) => {
    audit.push({ aktor, aksi, detail });
  },
}));

const { asisten, jadwal } = await import("../../../src/lib/schema");
const { handleSchedulePost } = await import("../penugasan-api");

const SLOT = ["YEN", "ADD", "REG", "NUE", "MAP"];

function jalan(ubah: Record<string, unknown>) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
    },
  };
  const req = { body: { semester: "2026-ganjil", hari: 4, slot: 3, ubah }, headers: {} };
  return handleSchedulePost(req as never, res as never, { nim: "1101200009" } as never).then(
    () => out,
  );
}

beforeEach(() => {
  audit.length = 0;
  tersimpan = null;
  data.clear();
  data.set(jadwal, [{ asisten: SLOT, pj: null }]);
  data.set(
    asisten,
    SLOT.map((kode) => ({ nim: kode, kode, status: "aktif" })),
  );
});

describe("slot PJ", () => {
  it("refuses a code that is not one of the slot's Asisten", async () => {
    const r = await jalan({ pj: "ZZZ" });
    expect(r.body.kode).toBe("format_salah");
    expect(tersimpan).toBeNull();
  });

  it("judges against the people list this same save sets", async () => {
    expect((await jalan({ pj: "YEN", asisten: ["ADD", "REG"] })).body.kode).toBe("format_salah");
    expect((await jalan({ pj: "ADD", asisten: ["ADD", "REG"] })).body.ok).toBe(true);
  });

  it("refuses a PJ that is not text", async () => {
    expect((await jalan({ pj: 5 })).body.kode).toBe("format_salah");
  });

  it("saves a valid code in upper case and audits it", async () => {
    const r = await jalan({ pj: "nue" });
    expect(r.body.ok).toBe(true);
    expect(tersimpan?.pj).toBe("NUE");
    expect(audit[0].aksi).toBe("jadwal_ubah");
    expect((audit[0].detail as { ubah: { pj: string } }).ubah.pj).toBe("nue");
  });

  it("clears the PJ with null", async () => {
    data.set(jadwal, [{ asisten: SLOT, pj: "NUE" }]);
    const r = await jalan({ pj: null });
    expect(r.body.ok).toBe(true);
    expect(tersimpan).toHaveProperty("pj", null);
  });

  it("clears a PJ the new people list no longer holds", async () => {
    data.set(jadwal, [{ asisten: SLOT, pj: "NUE" }]);
    await jalan({ asisten: ["YEN", "ADD"] });
    expect(tersimpan).toHaveProperty("pj", null);
  });
});
