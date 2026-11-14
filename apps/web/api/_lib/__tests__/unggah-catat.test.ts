/**
 * The browser's report of a board flash (api/_lib/unggah-catat.ts): what is kept, what is cut, and
 * how often one person may report. The report carries no value the person typed.
 */
import { describe, expect, it, vi } from "vitest";

const rows: Record<string, unknown>[] = [];
vi.mock("../../../src/lib/db.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        rows.push(v);
      },
    }),
  }),
}));

import { bersihkanLaporan, bolehLapor, handleUnggahCatat } from "../unggah-catat";

function jawab() {
  const res = {
    code: 200,
    body: undefined as unknown as Record<string, unknown>,
    status(n: number) {
      res.code = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
  };
  return res;
}
const req = (body: unknown) => ({ method: "POST", body, headers: {}, query: {} }) as never;
const sesi = (nim: string) => ({ nim, role: "praktikan" }) as never;

const dasar = {
  modul: 2,
  role: "esp32",
  hasil: "gagal",
  kode: "gagal_masuk_bootloader",
  via: "",
  ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157",
  sistem: "Windows",
  vid: "1a86",
  pid: "7523",
  log: "-- attempt: 460800 baud, stub\n-- Failed to connect to ESP32: No serial data received.",
  ms: 41234,
};

describe("bersihkanLaporan", () => {
  it("keeps a good failure report as it is", () => {
    expect(bersihkanLaporan(dasar)).toEqual(dasar);
  });

  it("keeps a success with the way in that worked", () => {
    const r = bersihkanLaporan({
      ...dasar,
      hasil: "ok",
      kode: "",
      via: "reset-460800-stub",
      log: "",
    });
    expect(r).toMatchObject({ hasil: "ok", via: "reset-460800-stub", kode: "" });
  });

  it("refuses anything that is not a report", () => {
    expect(bersihkanLaporan({})).toBeNull();
    expect(bersihkanLaporan({ ...dasar, modul: 0 })).toBeNull();
    expect(bersihkanLaporan({ ...dasar, modul: 5 })).toBeNull();
    expect(bersihkanLaporan({ ...dasar, modul: 1.5 })).toBeNull();
    expect(bersihkanLaporan({ ...dasar, hasil: "mungkin" })).toBeNull();
    expect(bersihkanLaporan({ ...dasar, kode: "<script>" })).toBeNull();
  });

  it("cuts every free text to a short fixed length", () => {
    const r = bersihkanLaporan({
      ...dasar,
      ua: "u".repeat(5000),
      sistem: "s".repeat(500),
      log: "l".repeat(50_000),
      role: "r".repeat(200),
    })!;
    expect(r.ua).toHaveLength(200);
    expect(r.sistem).toHaveLength(40);
    expect(r.log).toHaveLength(1000);
    expect(r.role).toHaveLength(20);
  });

  it("drops USB ids that are not four hex digits, and keeps a number's range sane", () => {
    const r = bersihkanLaporan({ ...dasar, vid: "zzzz", pid: "12345", ms: -5 })!;
    expect(r.vid).toBe("");
    expect(r.pid).toBe("");
    expect(r.ms).toBe(0);
    expect(bersihkanLaporan({ ...dasar, ms: 1e12 })!.ms).toBe(3_600_000);
  });

  it("saves only its own fields: whatever else the browser sent is dropped", () => {
    const r = bersihkanLaporan({
      ...dasar,
      wifi: "rahasia123",
      ssid: "Wifi",
      key: "HD9LAUK9",
    })!;
    expect(JSON.stringify(r)).not.toMatch(/rahasia123|HD9LAUK9|Wifi/);
    expect(Object.keys(r).sort()).toEqual(
      ["hasil", "kode", "log", "modul", "ms", "pid", "role", "sistem", "ua", "via", "vid"].sort(),
    );
  });
});

describe("handleUnggahCatat", () => {
  it("saves one audit row for the signed in person, with only the cleaned fields", async () => {
    rows.length = 0;
    const res = jawab();
    await handleUnggahCatat(req({ ...dasar, wifi: "rahasia123" }), res as never, sesi("2211"));
    expect(res.body).toEqual({ ok: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ aktorNim: "2211", aksi: "unggah_catat" });
    expect(String(rows[0].detail)).not.toContain("rahasia123");
    expect(JSON.parse(String(rows[0].detail))).toMatchObject({ modul: 2, hasil: "gagal" });
  });

  it("answers format_salah and saves nothing for something that is not a report", async () => {
    rows.length = 0;
    const res = jawab();
    await handleUnggahCatat(req({ modul: 9 }), res as never, sesi("2212"));
    expect(res.body).toEqual({ ok: false, kode: "format_salah" });
    expect(rows).toHaveLength(0);
  });
});

describe("bolehLapor", () => {
  it("lets one person report 30 times in ten minutes, then stops, then starts again", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(bolehLapor("nim-a", t0 + i)).toBe(true);
    expect(bolehLapor("nim-a", t0 + 100)).toBe(false);
    expect(bolehLapor("nim-b", t0 + 100)).toBe(true);
    expect(bolehLapor("nim-a", t0 + 10 * 60_000 + 1)).toBe(true);
  });
});
