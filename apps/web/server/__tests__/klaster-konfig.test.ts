import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BERKAS_PENGAWAS,
  jumlahPekerja,
  kolamPerPekerja,
  sidikPengawas,
} from "../klaster/konfig.js";

afterEach(() => vi.restoreAllMocks());

describe("how many workers", () => {
  it("takes half the cores, at least 2 and at most 4", () => {
    expect(jumlahPekerja({}, 1)).toBe(2);
    expect(jumlahPekerja({}, 4)).toBe(2);
    expect(jumlahPekerja({}, 8)).toBe(4);
    expect(jumlahPekerja({}, 64)).toBe(4);
  });

  it("obeys IRIS_PEKERJA, including 0 for one plain process", () => {
    expect(jumlahPekerja({ IRIS_PEKERJA: "6" }, 4)).toBe(6);
    expect(jumlahPekerja({ IRIS_PEKERJA: "0" }, 8)).toBe(0);
    expect(jumlahPekerja({ IRIS_PEKERJA: " 3 " }, 8)).toBe(3);
  });

  it("ignores a value that is not a whole number from 0 to 32, and says so", () => {
    const e = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(jumlahPekerja({ IRIS_PEKERJA: "many" }, 8)).toBe(4);
    expect(jumlahPekerja({ IRIS_PEKERJA: "-1" }, 8)).toBe(4);
    expect(jumlahPekerja({ IRIS_PEKERJA: "2.5" }, 8)).toBe(4);
    expect(jumlahPekerja({ IRIS_PEKERJA: "99" }, 8)).toBe(4);
    expect(e).toHaveBeenCalledTimes(4);
    expect(jumlahPekerja({ IRIS_PEKERJA: "" }, 8)).toBe(4);
  });
});

describe("database connections per worker", () => {
  it("splits a total of 40 by default, never below 8 each", () => {
    expect(kolamPerPekerja({}, 4)).toBe("10");
    expect(kolamPerPekerja({}, 2)).toBe("20");
    expect(kolamPerPekerja({}, 16)).toBe("8");
  });

  it("uses IRIS_DB_TOTAL, and leaves a pool the owner set alone", () => {
    expect(kolamPerPekerja({ IRIS_DB_TOTAL: "80" }, 4)).toBe("20");
    expect(kolamPerPekerja({ IRIS_DB_POOL: "25" }, 4)).toBeUndefined();
  });
});

describe("supervisor print", () => {
  it("changes when one of the supervisor's files changes, and not otherwise", () => {
    const akar = mkdtempSync(join(tmpdir(), "iris-sidik-"));
    mkdirSync(join(akar, "server/klaster"), { recursive: true });
    for (const b of BERKAS_PENGAWAS) writeFileSync(join(akar, b), `isi ${b}`);
    const a = sidikPengawas(akar);
    expect(sidikPengawas(akar)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    writeFileSync(join(akar, "server/klaster/utama.ts"), "lain");
    expect(sidikPengawas(akar)).not.toBe(a);
  });
});
