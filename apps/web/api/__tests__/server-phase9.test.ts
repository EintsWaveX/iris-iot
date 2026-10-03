/**
 * Phase 9 (A3): the server detail GET and the diag.siap queueing, run
 * through the real handlers with the database replaced by a queue of
 * canned query results (each awaited Drizzle chain takes the next one).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hasil: unknown[][] = [];
const ditulis: unknown[] = [];

function chain(): unknown {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit", "insert", "returning"]) {
    p[m] = () => p;
  }
  p.values = (v: unknown) => {
    ditulis.push(v);
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => ok(hasil.shift() ?? []);
  return p;
}

vi.mock("../../src/lib/db", () => ({
  getDb: () => ({ select: () => chain(), selectDistinctOn: () => chain(), insert: () => chain() }),
}));
vi.mock("../_lib/session", () => ({
  requireRole: () => ({ nim: "1010", role: "asisten" }),
}));
vi.mock("../../src/lib/sesi", () => ({
  currentSesi: async () => ({ id: 7, modul: 4, mulaiPada: new Date(), dibuatPada: new Date() }),
}));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => {},
}));

const { default: serverDetail } = await import("../server/[id]");
const { default: action } = await import("../action");

function fakeRes() {
  const res = {
    body: undefined as unknown,
    status() {
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader() {},
  };
  return res;
}

async function call(
  handler: (req: never, res: never) => unknown,
  req: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = fakeRes();
  await handler(req as never, res as never);
  return res.body as Record<string, unknown>;
}

/** The row cekHak loads for the signed-in Asisten (Phase 9 rights). */
const orang = (tier: string) => [
  { nim: "1010", kode: "TST", nama: "Tester", tier, badges: [], hakOverride: {}, status: "aktif" },
];

beforeEach(() => {
  hasil.length = 0;
  ditulis.length = 0;
});

describe("GET /api/server/:id", () => {
  it("returns the saved settings fields and the running module, and no device list", async () => {
    hasil.push(
      [
        {
          id: 3,
          nama: "Pi Lab",
          kode: "pi-lab",
          alamatLan: "10.117.177.102",
          lokasi: "Lab A",
          catatan: "dekat jendela",
          agenVersi: "2.4.0",
          infoSistem: { os: "Armbian" },
          infoSistemPada: new Date("2026-10-02T09:00:00Z"),
          terdaftarPada: new Date("2026-09-01T00:00:00Z"),
        },
      ],
      [],
      [{ id: 41, aksi: "diag.siap" }],
    );
    const body = await call(serverDetail, { method: "GET", query: { id: "3" } });
    expect(body.ok).toBe(true);
    const server = body.server as Record<string, unknown>;
    expect(server.lokasi).toBe("Lab A");
    expect(server.catatan).toBe("dekat jendela");
    expect(server.agenVersi).toBe("2.4.0");
    expect(server.alamatLan).toBe("10.117.177.102");
    expect(body.sesiModul).toBe(4);
    expect(body).not.toHaveProperty("perangkat");
  });

  it("pages older commands and says whether more exist", async () => {
    hasil.push(Array.from({ length: 21 }, (_, i) => ({ id: 100 - i })));
    const body = await call(serverDetail, {
      method: "GET",
      query: { id: "3", aksi: "perintah", sebelum: "101" },
    });
    expect(body.ok).toBe(true);
    expect((body.perintah as unknown[]).length).toBe(20);
    expect(body.lagi).toBe(true);
  });

  it("refuses a page request without a valid cursor", async () => {
    const body = await call(serverDetail, {
      method: "GET",
      query: { id: "3", aksi: "perintah", sebelum: "x" },
    });
    expect(body).toEqual({ ok: false, kode: "format_salah" });
  });
});

describe("POST /api/action kirim diag.siap", () => {
  const kirim = (argumen: Record<string, string>) =>
    call(action, {
      method: "POST",
      body: { tipe: "kirim", serverId: 3, aksi: "diag.siap", argumen },
    });

  it("queues the Ready check for a known module", async () => {
    hasil.push(orang("pengelola"), [{ id: 3 }], [{ id: 55 }]);
    expect(await kirim({ modul: "4" })).toEqual({ ok: true, id: 55 });
    expect(ditulis[0]).toMatchObject({ aksi: "diag.siap", argumen: { modul: "4" } });
  });

  it("queues it with no module named", async () => {
    hasil.push(orang("pengelola"), [{ id: 3 }], [{ id: 56 }]);
    expect(await kirim({})).toEqual({ ok: true, id: 56 });
  });

  it("refuses a module the agent would refuse", async () => {
    for (const modul of ["1", "5", "4; reboot", "--modul"]) {
      hasil.push(orang("pengelola"));
      expect(await kirim({ modul })).toEqual({ ok: false, kode: "format_salah" });
    }
    expect(ditulis).toEqual([]);
  });

  it("no longer accepts the removed device actions", async () => {
    hasil.push(orang("admin"));
    const body = await call(action, {
      method: "POST",
      body: { tipe: "adopsi", id: 1, nama: "x", jenis: "esp32" },
    });
    expect(body).toEqual({ ok: false, kode: "format_salah" });
  });

  it("lets an Asisten run the Ready check for their own slot", async () => {
    hasil.push(orang("asisten"), [{ id: 3 }], [{ id: 57 }]);
    expect(await kirim({ modul: "2" })).toEqual({ ok: true, id: 57 });
  });

  it("refuses service control to an Asisten without the Server right", async () => {
    hasil.push(orang("asisten"));
    const body = await call(action, {
      method: "POST",
      body: {
        tipe: "kirim",
        serverId: 3,
        aksi: "layanan.mulai_ulang",
        argumen: { layanan: "mosquitto" },
      },
    });
    expect(body).toEqual({ ok: false, kode: "tanpa_hak", hak: "server" });
    expect(ditulis).toEqual([]);
  });
});
