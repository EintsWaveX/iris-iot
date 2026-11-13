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

  it("limits one person to 12 builds in 10 minutes", async () => {
    const who = orang("asisten");
    for (let i = 0; i < 12; i++)
      expect((await bangun(pesan(), who)).body).toMatchObject({ ok: true });
    expect((await bangun(pesan(), who)).body).toEqual({ ok: false, kode: "terlalu_sering" });
    expect((await bangun(pesan(), orang("asisten"))).body).toMatchObject({ ok: true });
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
