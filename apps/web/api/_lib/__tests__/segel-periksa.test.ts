import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bungkus } from "../rahasia.js";
import { LABEL_SEGEL } from "../rahasia-putar.js";
import { periksaSegel } from "../segel-periksa.js";

const KUNCI_A = "ab".repeat(32);
const KUNCI_B = "cd".repeat(32);
const SESI = "sesi-uji-".repeat(6);

let sesiAwal: string | undefined;
let dataAwal: string | undefined;
beforeEach(() => {
  sesiAwal = process.env.SESSION_SECRET;
  dataAwal = process.env.DATA_KUNCI;
  process.env.SESSION_SECRET = SESI;
  delete process.env.DATA_KUNCI;
});
afterEach(() => {
  if (sesiAwal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = sesiAwal;
  if (dataAwal === undefined) delete process.env.DATA_KUNCI;
  else process.env.DATA_KUNCI = dataAwal;
});

const seg = (nim: string) => ({ nim, segel: bungkus("isi-" + nim, nim, LABEL_SEGEL) });

describe("periksaSegel", () => {
  it("counts every seal open when the machine has the key they were wrapped with", () => {
    process.env.DATA_KUNCI = KUNCI_A;
    const rows = [seg("n1"), seg("n2"), seg("n3")];
    expect(periksaSegel(rows)).toEqual({ total: 3, g1: 0, g2: 3, terbuka: 3, tertutup: 0 });
  });

  it("counts them closed under a different DATA_KUNCI, which is how a wrong key shows up", () => {
    process.env.DATA_KUNCI = KUNCI_A;
    const rows = [seg("n1"), seg("n2")];
    process.env.DATA_KUNCI = KUNCI_B;
    expect(periksaSegel(rows)).toEqual({ total: 2, g1: 0, g2: 2, terbuka: 0, tertutup: 2 });
  });

  it("tells an old g1 from a new g2, and a g1 closes once the session secret has changed", () => {
    const lama = seg("n1");
    process.env.DATA_KUNCI = KUNCI_A;
    const baru = seg("n2");
    expect(periksaSegel([lama, baru])).toEqual({ total: 2, g1: 1, g2: 1, terbuka: 2, tertutup: 0 });
    process.env.SESSION_SECRET = "sesi-lain-".repeat(6);
    expect(periksaSegel([lama, baru])).toEqual({ total: 2, g1: 1, g2: 1, terbuka: 1, tertutup: 1 });
  });

  it("is quiet about an empty table", () => {
    expect(periksaSegel([])).toEqual({ total: 0, g1: 0, g2: 0, terbuka: 0, tertutup: 0 });
  });
});
