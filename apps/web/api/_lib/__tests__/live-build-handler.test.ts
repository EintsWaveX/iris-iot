/**
 * Live Upload's routes: who may build what (the journal gate, the answers gate, the
 * rate limit), that a MicroPython file comes back as text and an ESP32 one as a
 * build, and that a build can only be read back by the person who asked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Kerja = { jurnal: number[]; diikuti: number[] };
let akses: Kerja = { jurnal: [1, 2, 3, 4], diikuti: [1, 2, 3, 4] };
let benar: { benar: number; total: number } | null = { benar: 6, total: 6 };
const jawabanBenar = vi.fn(async (..._a: unknown[]) => benar);
let layananJawab: { status: number; body: unknown; raw?: Uint8Array } = {
  status: 202,
  body: { id: "a".repeat(16), state: "queued", pos: 1, size: 0, kode: null, log: "" },
};
const fetchCalls: { url: string; init?: RequestInit }[] = [];

vi.mock("../../../src/lib/akses", () => ({ statusRiwayat: async () => akses }));
vi.mock("../jawaban-scope", () => ({ jawabanBenar: (...a: unknown[]) => jawabanBenar(...a) }));
vi.mock("../../../src/lib/jaringan-hunt", () => ({ bacaJaringanHunt: async () => "internet" }));
// The lab's layout for Module 4 Beacons: a running session, the layout setting and the PC's board keys
let sesiJalan: { id: number; modul: number; jumlahKelompok: number } | null = null;
let layout: { jumlah: number | null; pola: "selang" | "berurutan" } = {
  jumlah: null,
  pola: "selang",
};
let kunciPc: Record<string, string> = {};
vi.mock("../../../src/lib/sesi", () => ({ currentSesi: async () => sesiJalan }));
vi.mock("../../../src/lib/beacon-hunt", () => ({ bacaBeaconHunt: async () => layout }));
vi.mock("../perburuan-api", () => ({ kunciPapanSemua: async () => kunciPc }));
vi.mock("../kode-aktif", async (orig) => {
  const real = await orig<typeof import("../kode-aktif")>();
  return { ...real, kodeModul: async (m: number) => real.kodeBawaan(m) };
});

process.env.IRIS_BUILD_TOKEN = "t".repeat(24);
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  fetchCalls.push({ url, init });
  if (layananJawab.raw)
    return new Response(new Blob([layananJawab.raw as BlobPart]), { status: layananJawab.status });
  return new Response(JSON.stringify(layananJawab.body), { status: layananJawab.status });
}) as unknown as typeof fetch;

const { handleBangunBerkas, handleBangunPost, handleBangunStatus } = await import("../live-build");

function jawab() {
  const res = {
    code: 200,
    body: undefined as unknown as Record<string, unknown>,
    raw: undefined as unknown,
    headers: {} as Record<string, string>,
    status(n: number) {
      res.code = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    end(d: unknown) {
      res.raw = d;
    },
  };
  return res;
}

let nim = 0;
const orang = (role: "praktikan" | "asisten" = "praktikan") =>
  ({ nim: `N${++nim}`, role, kelompokId: 7, kelompokNomor: 3, nama: "x" }) as never;

const pesan = (over: Record<string, unknown> = {}) => ({
  modul: 4,
  role: "hunter",
  bahasa: "en",
  ssid: "LabWifi",
  password: "Secret123",
  group: 3,
  key: "HD9LAUK9",
  ...over,
});

async function bangun(body: unknown, who = orang()) {
  const res = jawab();
  await handleBangunPost({ body } as never, res as never, who);
  return res;
}

beforeEach(() => {
  sesiJalan = null;
  layout = { jumlah: null, pola: "selang" };
  kunciPc = {};
  akses = { jurnal: [1, 2, 3, 4], diikuti: [1, 2, 3, 4] };
  benar = { benar: 6, total: 6 };
  jawabanBenar.mockClear();
  fetchCalls.length = 0;
  layananJawab = {
    status: 202,
    body: { id: "a".repeat(16), state: "queued", pos: 1, size: 0, kode: null, log: "" },
  };
});

describe("POST bangun", () => {
  it("starts a build for an ESP32 file and hands back its id", async () => {
    const r = await bangun(pesan());
    expect(r.body).toMatchObject({
      ok: true,
      kind: "esp32",
      id: "a".repeat(16),
      state: "queued",
      pos: 1,
    });
    expect(fetchCalls).toHaveLength(1);
    const sent = JSON.parse(fetchCalls[0].init!.body as string);
    expect(sent.fqbn).toBe("esp32:esp32:esp32");
    // The sketch that went to the PC holds the escaped values and never the raw password
    expect(sent.files["s.ino"]).not.toContain("Secret123");
    expect(sent.files["s.ino"]).toContain("\\123\\145\\143"); // "Sec"
  });

  it("returns a MicroPython file's text without any build", async () => {
    const r = await bangun(pesan({ modul: 3, role: "publisher" }));
    expect(r.body).toMatchObject({ ok: true, kind: "pico", path: "modul3_mqtt_publish.py" });
    expect(String(r.body.teks)).not.toContain("________");
    expect(fetchCalls).toHaveLength(0);
  });

  it("names a bad value and its box, before anything else is asked", async () => {
    const r = await bangun(pesan({ ssid: "" }));
    expect(r.body).toEqual({ ok: false, kode: "ssid_kosong", field: "ssid" });
    expect(jawabanBenar).not.toHaveBeenCalled();
  });

  it("the journal gate: a Praktikan builds only for a module open to them", async () => {
    akses = { jurnal: [1], diikuti: [1, 4] };
    expect((await bangun(pesan())).body).toMatchObject({
      ok: false,
      kode: "riwayat_belum_terbuka",
    });
    akses = { jurnal: [1], diikuti: [1] };
    expect((await bangun(pesan())).body).toMatchObject({ ok: false, kode: "belum_praktikum" });
    // An Asisten is not held by it
    expect((await bangun(pesan(), orang("asisten"))).body).toMatchObject({ ok: true });
  });

  it("the answers gate: a Praktikan needs every blank of that file right, an Asisten does not", async () => {
    benar = { benar: 4, total: 6 };
    expect((await bangun(pesan())).body).toMatchObject({
      ok: false,
      kode: "belum_lengkap",
      benar: 4,
      total: 6,
    });
    expect(fetchCalls).toHaveLength(0);
    expect((await bangun(pesan(), orang("asisten"))).body).toMatchObject({ ok: true });
    expect(jawabanBenar).toHaveBeenCalledTimes(1); // the Asisten never asked it
    benar = null;
    expect((await bangun(pesan())).body).toMatchObject({
      ok: false,
      kode: "kelompok_tidak_diketahui",
    });
  });

  it("limits one person to 20 builds in 10 minutes", async () => {
    const who = orang("asisten");
    for (let i = 0; i < 20; i++)
      expect((await bangun(pesan({ ssid: `Net${i}` }), who)).body).toMatchObject({ ok: true });
    expect((await bangun(pesan({ ssid: "Over" }), who)).body).toEqual({
      ok: false,
      kode: "terlalu_sering",
    });
    expect((await bangun(pesan(), orang("asisten"))).body).toMatchObject({ ok: true });
  });

  it("pressing Upload again for a build already made does not count against the limit", async () => {
    const who = orang("asisten");
    layananJawab = {
      status: 202,
      body: { id: "d".repeat(16), state: "done", pos: 0, size: 5000, kode: null, log: "" },
    };
    for (let i = 0; i < 25; i++)
      expect((await bangun(pesan(), who)).body).toMatchObject({ ok: true });
  });

  it("a MicroPython file never counts against the limit, and a refused build is given back", async () => {
    const who = orang("asisten");
    for (let i = 0; i < 25; i++)
      expect((await bangun(pesan({ modul: 3, role: "publisher" }), who)).body).toMatchObject({
        ok: true,
        kind: "pico",
      });
    layananJawab = { status: 503, body: { kode: "sibuk" } };
    for (let i = 0; i < 25; i++)
      expect((await bangun(pesan({ ssid: `Busy${i}` }), who)).body).toEqual({
        ok: false,
        kode: "sibuk",
      });
  });

  it("says so when the PC is busy or the build service is not there", async () => {
    layananJawab = { status: 503, body: { kode: "sibuk" } };
    expect((await bangun(pesan(), orang("asisten"))).body).toEqual({ ok: false, kode: "sibuk" });
    layananJawab = { status: 500, body: {} };
    expect((await bangun(pesan(), orang("asisten"))).body).toEqual({
      ok: false,
      kode: "layanan_galat",
    });
  });
});

describe("GET bangun-status and bangun-berkas", () => {
  const baca = async (fn: typeof handleBangunStatus, id: string, who: never) => {
    const res = jawab();
    await fn({ query: { id } } as never, res as never, who);
    return res;
  };

  it("only the person who asked can read a build back", async () => {
    const me = orang("asisten");
    const other = orang("asisten");
    const id = "b".repeat(16);
    layananJawab = {
      status: 202,
      body: { id, state: "queued", pos: 1, size: 0, kode: null, log: "" },
    };
    await bangun(pesan(), me);
    layananJawab = {
      status: 200,
      body: { id, state: "done", pos: 0, size: 5000, kode: null, log: "" },
    };
    expect((await baca(handleBangunStatus, id, me)).body).toMatchObject({
      ok: true,
      state: "done",
      size: 5000,
    });
    expect((await baca(handleBangunStatus, id, other)).body).toEqual({
      ok: false,
      kode: "tak_ada",
    });
    expect((await baca(handleBangunStatus, "zz", me)).body).toEqual({ ok: false, kode: "tak_ada" });
  });

  it("streams the image to its owner as bytes, and nothing to anyone else", async () => {
    const me = orang("asisten");
    const id = "c".repeat(16);
    layananJawab = {
      status: 202,
      body: { id, state: "queued", pos: 1, size: 0, kode: null, log: "" },
    };
    await bangun(pesan(), me);
    layananJawab = { status: 200, body: {}, raw: new Uint8Array([0xff, 0xe9, 1, 2]) };
    const mine = await baca(handleBangunBerkas, id, me);
    expect(mine.headers["Content-Type"]).toBe("application/octet-stream");
    expect(Array.from(mine.raw as Buffer)).toEqual([0xff, 0xe9, 1, 2]);
    const theirs = await baca(handleBangunBerkas, id, orang("asisten"));
    expect(theirs.body).toEqual({ ok: false, kode: "tak_ada" });
  });
});

describe("POST bangun, a Beacon that serves several groups", () => {
  const KUNCI = {
    "1": "AAAAAAAA",
    "2": "BBBBBBBB",
    "3": "CCCCCCCC",
    "4": "DDDDDDDD",
    "5": "EEEEEEEE",
  };
  const kirim = () => JSON.parse(fetchCalls[0].init!.body as string).files["s.ino"] as string;
  const beacon = (over: Record<string, unknown> = {}) => pesan({ role: "beacon", ...over });

  it("group 3 of 5 on 2 Beacons gets GROUP_ID 3 and groups 1 and 5 with the PC's keys", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 5 };
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = KUNCI;
    const r = await bangun(beacon());
    expect(r.body.ok).toBe(true);
    const sk = kirim();
    expect(sk).toMatch(/#define GROUP_ID 3\b/);
    expect(sk).toContain("irisSharedGroup[] = {1, 5};");
    expect(sk).toContain("irisSharedSync[] = {0xF1, 0xF5};");
    expect(sk).toContain('irisSharedKey[] = {"AAAAAAAA", "EEEEEEEE"};');
  });

  it("never takes the extra groups or keys from the request", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 5 };
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = KUNCI;
    await bangun(beacon({ tambahan: [{ grup: 2, sync: "0xF2", kunci: "ZZZZZZZZ" }], extra: [2] }));
    expect(kirim()).not.toContain("ZZZZZZZZ");
    expect(kirim()).toContain("irisSharedGroup[] = {1, 5};");
  });

  it("builds no extras without a running Module 4 session (practice)", async () => {
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = KUNCI;
    await bangun(beacon());
    expect(kirim()).not.toContain("irisShared");
    sesiJalan = { id: 9, modul: 3, jumlahKelompok: 5 };
    fetchCalls.length = 0;
    await bangun(beacon());
    expect(kirim()).not.toContain("irisShared");
  });

  it("with the default layout the file equals a single group's file", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 5 };
    kunciPc = KUNCI;
    await bangun(beacon());
    expect(kirim()).not.toContain("irisShared");
  });

  it("refuses when a served group has no key yet, and never calls the build service", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 5 };
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = { "1": "AAAAAAAA" };
    const r = await bangun(beacon());
    expect(r.body).toMatchObject({ ok: false, kode: "beacon_kunci_belum_ada" });
    expect(fetchCalls).toHaveLength(0);
  });

  it("refuses when two served groups would share a slot", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 12 };
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), "ABCDEFGH"]));
    const r = await bangun(beacon({ group: 1 }));
    expect(r.body).toMatchObject({ ok: false, kode: "beacon_slot_bentrok" });
    expect(fetchCalls).toHaveLength(0);
  });

  it("a Hunter never gets extra groups", async () => {
    sesiJalan = { id: 9, modul: 4, jumlahKelompok: 5 };
    layout = { jumlah: 2, pola: "selang" };
    kunciPc = KUNCI;
    await bangun(pesan({ role: "hunter" }));
    expect(kirim()).not.toContain("irisShared");
  });
});
