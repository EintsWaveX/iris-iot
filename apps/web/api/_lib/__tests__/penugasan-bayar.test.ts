/**
 * Phase 18: an Izin or a seat changed in the Jadwal drawer for a date whose
 * session already ended clears that session's Bayar stamp, so the lazy
 * rebuild (api/_lib/bayar.ts) runs it again with the new expected people.
 * The handler runs over canned rows per table; writes are recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<unknown, unknown[]>();
const ubah: { tabel: unknown; v: unknown }[] = [];
const disisip: { tabel: unknown; v: unknown }[] = [];

function chain(tabel?: unknown, hasil?: unknown[]): unknown {
  const st = { tabel };
  const p: Record<string, unknown> = {};
  for (const m of ["select", "where", "orderBy", "limit", "onConflictDoUpdate"]) p[m] = () => p;
  p.from = (t: unknown) => {
    st.tabel = t;
    return p;
  };
  p.set = (v: unknown) => {
    ubah.push({ tabel: st.tabel, v });
    return p;
  };
  p.values = (v: unknown) => {
    disisip.push({ tabel: st.tabel, v });
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(hasil ?? data.get(st.tabel) ?? []);
  return p;
}

const SLOT_ROW = {
  id: 7,
  semester: "",
  hari: 4,
  slot: 1,
  status: "aktif",
  liburTanggal: null,
  kelas: "reguler",
  jumlahKelompok: 5,
  asisten: ["AAA", "BBB", "CCC", "DDD", "EEE"],
  asistenModul: {},
  pengganti: [],
  pj: null,
  jendelaMulaiMenit: null,
};

const db = {
  select: () => chain(),
  update: (t: unknown) => chain(t, []),
  delete: (t: unknown) => chain(t, []),
  insert: (t: unknown) => {
    const p = chain(t, []) as Record<string, unknown>;
    p.returning = async () => [{ ...SLOT_ROW, semester: data.get("semester")![0] }];
    return p;
  },
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
};

vi.mock("../../../src/lib/db", () => ({ getDb: () => db }));
vi.mock("../../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => {},
}));
vi.mock("../pasangan-modul", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  konteksModul: async () => ({ aktif: false, jumlah: 4, jendela: [], terbuka: [] }),
  modulPerSlot: async () => new Map(),
}));

const S = await import("../../../src/lib/schema");
const { hariIniWib } = await import("../../../src/lib/jadwal");
const { semesterDariTanggal } = await import("../../../src/lib/jadwal-parser");
const { bayarUlangSlot, handleSchedulePost } = await import("../penugasan-api");

const KINI = semesterDariTanggal(hariIniWib());

function jalan(ubahSlot: Record<string, unknown>) {
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
  const req = { body: { semester: KINI, hari: 4, slot: 1, ubah: ubahSlot }, headers: {} };
  return handleSchedulePost(req as never, res as never, { nim: "1010" } as never).then(() => out);
}

const bayarDibuka = () =>
  ubah.filter(
    (u) => u.tabel === S.sesi && (u.v as Record<string, unknown>).bayarSinkronPada === null,
  );

beforeEach(() => {
  data.clear();
  ubah.length = 0;
  disisip.length = 0;
  data.set("semester", [KINI]);
  data.set(S.jadwal, [{ ...SLOT_ROW, semester: KINI }]);
  data.set(
    S.asisten,
    ["AAA", "BBB", "CCC", "DDD", "EEE"].map((kode) => ({ nim: kode, kode, status: "aktif" })),
  );
});

describe("bayarUlangSlot", () => {
  it("clears the Bayar stamp of the slot's session that date", async () => {
    await bayarUlangSlot(db as never, 7, "2026-10-22");
    expect(bayarDibuka()).toHaveLength(1);
  });

  it("does nothing for a slot that is gone", async () => {
    data.set(S.jadwal, []);
    await bayarUlangSlot(db as never, 7, "2026-10-22");
    expect(bayarDibuka()).toHaveLength(0);
  });
});

describe("the Jadwal drawer's seats", () => {
  it("an Izin saved for the date reopens that date's Bayar", async () => {
    const r = await jalan({
      minggu: { kursi: [{ nomor: 1, jenis: "izin", kode: "" }] },
    });
    expect(r.body.ok).toBe(true);
    expect(disisip.some((d) => d.tabel === S.izin)).toBe(true);
    expect(bayarDibuka()).toHaveLength(1);
  });

  it("a slot edit without seats leaves Bayar alone", async () => {
    const r = await jalan({ kelas: "reguler" });
    expect(r.body.ok).toBe(true);
    expect(bayarDibuka()).toHaveLength(0);
  });
});
