import { beforeEach, describe, expect, it } from "vitest";
import {
  RUTE_MAKS,
  bolehLihat,
  catat,
  catatQuery,
  dalamLingkup,
  kunciRute,
  persentil,
  mentah,
  ringkas,
  ringkasDari,
  ulang,
  TEPI_MS,
} from "../metrik.js";

beforeEach(() => ulang());

describe("kunciRute", () => {
  it("names an API route with its action and collapses ids", () => {
    expect(kunciRute("GET", "/api/session/now")).toBe("GET /api/session/now");
    expect(kunciRute("POST", "/api/session/nilai?aksi=simpan&x=secret")).toBe(
      "POST /api/session/nilai?aksi=simpan",
    );
    expect(kunciRute("GET", "/api/server/14?aksi=riwayat")).toBe("GET /api/server/:n?aksi=riwayat");
    expect(kunciRute("GET", "/f/abcdefghijklmnopqrstuv/x.pdf")).toBe("GET /f/:id");
  });

  it("puts every page under one name and never leaks a query string", () => {
    expect(kunciRute("GET", "/modul/1?token=zzz")).toBe("GET halaman");
    expect(kunciRute("GET", "/api/auth/me?token=zzz")).toBe("GET /api/auth/me");
  });
});

describe("histogram", () => {
  it("reads p50/p95/p99 from the bucket edges", () => {
    const tepi = TEPI_MS.map(() => 0);
    tepi[2] = 90; // <= 5 ms
    tepi[6] = 9; // <= 100 ms
    tepi[9] = 1; // <= 1000 ms
    expect(persentil(tepi, 50)).toBe(5);
    expect(persentil(tepi, 95)).toBe(100);
    expect(persentil(tepi, 100)).toBe(1000);
  });

  it("answers 0 when empty and -1 for something over 5 s", () => {
    expect(
      persentil(
        TEPI_MS.map(() => 0),
        50,
      ),
    ).toBe(0);
    catat("GET /api/lama", 200, 9000, { n: 0, ms: 0 });
    expect(ringkas().rute[0].p99).toBe(-1);
  });
});

describe("catat and ringkas", () => {
  it("sums requests, failures, time and queries per route, slowest first", () => {
    catat("GET /api/a", 200, 10, { n: 2, ms: 4 });
    catat("GET /api/a", 500, 30, { n: 4, ms: 8 });
    catat("GET /api/b", 200, 1000, { n: 1, ms: 900 });
    const r = ringkas();
    expect(r.rute.map((x) => x.rute)).toEqual(["GET /api/b", "GET /api/a"]);
    const a = r.rute[1];
    expect(a).toMatchObject({ n: 2, galat: 1, maks: 30, rataMs: 20, queryRata: 3, dbMsRata: 6 });
  });

  it("keeps at most RUTE_MAKS routes apart and counts the rest as 'lain'", () => {
    for (let i = 0; i < RUTE_MAKS + 25; i++) catat(`GET /api/r${i}`, 200, 1, { n: 0, ms: 0 });
    const r = ringkas(1000);
    expect(r.ruteTotal).toBe(RUTE_MAKS + 1);
    expect(r.rute.find((x) => x.rute === "lain")?.n).toBe(25);
  });
});

describe("query scope", () => {
  it("counts queries made inside a request and ignores those outside", async () => {
    const lingkup = { n: 0, ms: 0 };
    catatQuery(5);
    await dalamLingkup(lingkup, async () => {
      catatQuery(2);
      await new Promise((r) => setTimeout(r, 1));
      catatQuery(3);
    });
    expect(lingkup).toEqual({ n: 2, ms: 5 });
  });
});

describe("bolehLihat", () => {
  const T = "x".repeat(24);
  it("is closed without a configured token, with a short one, or a wrong header", () => {
    expect(bolehLihat(T, undefined)).toBe(false);
    expect(bolehLihat("short", "short")).toBe(false);
    expect(bolehLihat("y".repeat(24), T)).toBe(false);
    expect(bolehLihat("", T)).toBe(false);
  });
  it("opens only for the exact token", () => {
    expect(bolehLihat(T, T)).toBe(true);
  });
});

describe("several workers' numbers", () => {
  it("adds up requests, time and buckets per route and reads the percentiles from the sum", () => {
    const lingkup = { n: 0, ms: 0 };
    catat("GET /api/x", 200, 4, lingkup);
    catat("GET /api/x", 200, 4, lingkup);
    const a = mentah();
    ulang();
    catat("GET /api/x", 500, 300, lingkup);
    catat("GET /api/y", 200, 1, lingkup);
    const b = mentah();
    const gabung = ringkasDari([a, b]);
    const x = gabung.rute.find((r) => r.rute === "GET /api/x")!;
    expect(x).toMatchObject({ n: 3, galat: 1, maks: 300 });
    expect(x.rataMs).toBeCloseTo(102.7, 1);
    expect(x.p50).toBe(5);
    expect(x.p99).toBe(500);
    expect(gabung.ruteTotal).toBe(2);
    // The data one worker hands over is a copy: merging does not change it.
    expect(a.rute.find(([k]) => k === "GET /api/x")![1].n).toBe(2);
  });

  it("shows the worst event-loop delay and adds the sockets", () => {
    const dasar = { sejakDetik: 5, rute: [] as ReturnType<typeof mentah>["rute"] };
    const g = ringkasDari([
      { ...dasar, jedaLoopMs: { p50: 1, p99: 8, maks: 20 }, soket: { siaran: 3, ruang: 1 } },
      { ...dasar, sejakDetik: 9, jedaLoopMs: { p50: 2, p99: 5, maks: 90 }, soket: { siaran: 4 } },
    ]);
    expect(g.jedaLoopMs).toEqual({ p50: 2, p99: 8, maks: 90 });
    expect(g.soket).toEqual({ siaran: 7, ruang: 1 });
    expect(g.sejakDetik).toBe(9);
  });

  it("is what ringkas gives for one process", () => {
    catat("GET /api/z", 200, 2, { n: 1, ms: 1 });
    expect(ringkas().rute).toEqual(ringkasDari([mentah()]).rute);
  });
});
