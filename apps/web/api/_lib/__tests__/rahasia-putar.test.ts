import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buka, bungkus, dataKunciSiap, masihLama } from "../rahasia.js";
import { LABEL_SEGEL, putarSatu, putarSegel } from "../rahasia-putar.js";

const KUNCI_HEX = "ab".repeat(32);
const KUNCI_B64 = Buffer.alloc(32, 7).toString("base64");
const NIM = "1101200001";

let sesiAwal: string | undefined;
let dataAwal: string | undefined;
beforeEach(() => {
  sesiAwal = process.env.SESSION_SECRET;
  dataAwal = process.env.DATA_KUNCI;
  process.env.SESSION_SECRET = "sesi-lama-".repeat(5);
  delete process.env.DATA_KUNCI;
});
afterEach(() => {
  if (sesiAwal === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = sesiAwal;
  if (dataAwal === undefined) delete process.env.DATA_KUNCI;
  else process.env.DATA_KUNCI = dataAwal;
});

describe("the two envelopes", () => {
  it("writes g1 without DATA_KUNCI and g2 with it", () => {
    expect(bungkus("x", NIM, LABEL_SEGEL).startsWith("g1.")).toBe(true);
    process.env.DATA_KUNCI = KUNCI_HEX;
    expect(dataKunciSiap()).toBe(true);
    expect(bungkus("x", NIM, LABEL_SEGEL).startsWith("g2.")).toBe(true);
  });

  it("takes hex or base64, and treats a bad key as unset", () => {
    process.env.DATA_KUNCI = KUNCI_B64;
    expect(bungkus("x", NIM, "l").startsWith("g2.")).toBe(true);
    process.env.DATA_KUNCI = "terlalu-pendek";
    expect(dataKunciSiap()).toBe(false);
    expect(bungkus("x", NIM, "l").startsWith("g1.")).toBe(true);
  });

  it("opens a g1 made before DATA_KUNCI existed, and a g2 for its owner and label only", () => {
    const lama = bungkus("rahasia-lama", NIM, LABEL_SEGEL);
    process.env.DATA_KUNCI = KUNCI_HEX;
    expect(buka(lama, NIM, LABEL_SEGEL)).toBe("rahasia-lama");
    const baru = bungkus("rahasia-baru", NIM, LABEL_SEGEL);
    expect(buka(baru, NIM, LABEL_SEGEL)).toBe("rahasia-baru");
    expect(buka(baru, "1101200002", LABEL_SEGEL)).toBeNull();
    expect(buka(baru, NIM, "lain")).toBeNull();
  });

  it("does not open a g2 without its DATA_KUNCI or with another one", () => {
    process.env.DATA_KUNCI = KUNCI_HEX;
    const baru = bungkus("x", NIM, "l");
    delete process.env.DATA_KUNCI;
    expect(buka(baru, NIM, "l")).toBeNull();
    process.env.DATA_KUNCI = "cd".repeat(32);
    expect(buka(baru, NIM, "l")).toBeNull();
  });

  it("refuses an altered g2", () => {
    process.env.DATA_KUNCI = KUNCI_HEX;
    const [awal, iv, tag, enc] = bungkus("abc", "n", "l").split(".");
    const balik = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(buka([awal, iv, tag, balik(enc)].join("."), "n", "l")).toBeNull();
  });
});

describe("putarSatu: g1 to g2", () => {
  it("turns a g1 into a g2 that opens to the same text", () => {
    const lama = bungkus("segel-asisten", NIM, LABEL_SEGEL);
    process.env.DATA_KUNCI = KUNCI_HEX;
    const baru = putarSatu(lama, NIM, LABEL_SEGEL)!;
    expect(baru.startsWith("g2.")).toBe(true);
    expect(buka(baru, NIM, LABEL_SEGEL)).toBe("segel-asisten");
    expect(masihLama(baru)).toBe(false);
  });

  it("is the whole point: the session secret can change afterwards and nothing is lost", () => {
    const lama = bungkus("segel-asisten", NIM, LABEL_SEGEL);
    process.env.DATA_KUNCI = KUNCI_HEX;
    const baru = putarSatu(lama, NIM, LABEL_SEGEL)!;
    process.env.SESSION_SECRET = "sesi-baru-di-pc-".repeat(4);
    expect(buka(baru, NIM, LABEL_SEGEL)).toBe("segel-asisten");
    // The g1 it replaced is what the change would have lost.
    expect(buka(lama, NIM, LABEL_SEGEL)).toBeNull();
  });

  it("does nothing without DATA_KUNCI, on a g2, on another owner's seal or on a value it cannot open", () => {
    const lama = bungkus("x", NIM, LABEL_SEGEL);
    expect(putarSatu(lama, NIM, LABEL_SEGEL)).toBeNull();
    process.env.DATA_KUNCI = KUNCI_HEX;
    expect(putarSatu(lama, "1101200002", LABEL_SEGEL)).toBeNull();
    expect(putarSatu(bungkus("x", NIM, LABEL_SEGEL), NIM, LABEL_SEGEL)).toBeNull();
    process.env.SESSION_SECRET = "bukan-yang-lama-".repeat(4);
    expect(putarSatu(lama, NIM, LABEL_SEGEL)).toBeNull();
  });
});

/** The two drizzle chains putarSegel uses, over a list of rows. */
function dbPalsu(rows: { nim: string; segel: string }[], kalah = false) {
  const ditulis: { segel: string }[] = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => rows.map((r) => ({ ...r })) }) }),
    update: () => ({
      set: (v: { segel: string }) => ({
        where: () => ({
          returning: async () => {
            ditulis.push(v);
            // `kalah`: another write replaced the row first, so this one lands on nothing.
            return kalah ? [] : [{ nim: "x" }];
          },
        }),
      }),
    }),
  } as never;
  return { db, ditulis };
}

describe("putarSegel over a table", () => {
  it("does not even read the table without DATA_KUNCI", async () => {
    let dibaca = false;
    const db = {
      select: () => {
        dibaca = true;
        throw new Error("no");
      },
    } as never;
    expect(await putarSegel(db)).toEqual({ putar: 0, gagal: 0 });
    expect(dibaca).toBe(false);
  });

  it("re-keys what it can open, counts what it cannot, and writes only g2", async () => {
    const baik1 = bungkus("a", "n1", LABEL_SEGEL);
    const baik2 = bungkus("b", "n2", LABEL_SEGEL);
    const rusak = bungkus("c", "n3", LABEL_SEGEL).slice(0, -3) + "AAA";
    process.env.DATA_KUNCI = KUNCI_HEX;
    const { db, ditulis } = dbPalsu([
      { nim: "n1", segel: baik1 },
      { nim: "n2", segel: baik2 },
      { nim: "n3", segel: rusak },
    ]);
    expect(await putarSegel(db)).toEqual({ putar: 2, gagal: 1 });
    expect(ditulis).toHaveLength(2);
    expect(ditulis.every((v) => v.segel.startsWith("g2."))).toBe(true);
    expect(buka(ditulis[0].segel, "n1", LABEL_SEGEL)).toBe("a");
    expect(buka(ditulis[1].segel, "n2", LABEL_SEGEL)).toBe("b");
  });

  it("does not count a write that lost to a newer value in the row", async () => {
    const lama = bungkus("a", "n1", LABEL_SEGEL); // made before DATA_KUNCI: a g1
    process.env.DATA_KUNCI = KUNCI_HEX;
    const { db } = dbPalsu([{ nim: "n1", segel: lama }], true);
    expect(await putarSegel(db)).toEqual({ putar: 0, gagal: 0 });
  });
});
