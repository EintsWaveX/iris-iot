import { describe, expect, it } from "vitest";
import { generateKeyPairSync, privateDecrypt, constants } from "node:crypto";
import {
  bacaHariShift,
  bacaInfoSeelabs,
  barisPerKlp,
  setelahGagal,
  sidikJaga,
  slotJaga,
  statusAksesSetelah,
  JEDA_ULANG_DETIK,
  PERCOBAAN_MAKS,
  SUFIKS_BAWAAN,
  sufiksSah,
  type KelompokTarik,
} from "../seelabs-robot.js";
import { sandiBawaanSeelabs, segelSandi, sidikKunci } from "../seelabs-segel.js";

const kelompokDi = (klp: number, hari: string, shift: string): KelompokTarik => ({
  klp,
  hari,
  shift,
  anggota: [],
});

describe("barisPerKlp", () => {
  it("splits by each student's KLP, sends tp..l2 in lower case and a missing cell as 0", () => {
    const { perKlp, tanpaKlp } = barisPerKlp([
      {
        nim: "1",
        klp: "27",
        skor: { TP: 80, TA: 70, D1: 90, D2: 90, D3: 90, D4: 90, L1: 85, L2: 85 },
      },
      { nim: "2", klp: "28", skor: { TP: 60 } },
      { nim: "3", klp: "27", skor: {} },
    ]);
    expect(tanpaKlp).toEqual([]);
    expect([...perKlp.keys()]).toEqual(["27", "28"]);
    expect(perKlp.get("27")![0]).toEqual({
      nim: "1",
      tp: 80,
      ta: 70,
      d1: 90,
      d2: 90,
      d3: 90,
      d4: 90,
      l1: 85,
      l2: 85,
    });
    expect(perKlp.get("28")![0]).toMatchObject({ nim: "2", tp: 60, ta: 0, l2: 0 });
    expect(perKlp.get("27")!.map((b) => b.nim)).toEqual(["1", "3"]);
  });

  it("lists students without a KLP apart, so the group isn't sent half", () => {
    const { tanpaKlp } = barisPerKlp([{ nim: "9", klp: null, skor: {} }]);
    expect(tanpaKlp).toEqual(["9"]);
  });
});

describe("Input Jaga slots", () => {
  it("reads SeeLabs' day and shift text", () => {
    expect(bacaHariShift("Selasa Mgg2", "06.30 - 09.00")).toEqual({ hari: 2, minggu: 2, shift: 1 });
    expect(bacaHariShift("Jum'at Mgg 1", "Shift 15.30 - 18.00")).toEqual({
      hari: 5,
      minggu: 1,
      shift: 4,
    });
    expect(bacaHariShift("Minggu Mgg2", "06.30")).toBeNull();
    expect(bacaHariShift("Senin Mgg3", "06.30")).toBeNull();
    expect(bacaHariShift("Senin Mgg1", "07.00")).toBeNull();
  });

  it("takes each taught slot's week from the KLP pull and merges a day's shifts", () => {
    const tarik = {
      "237": [
        kelompokDi(1, "Selasa Mgg2", "06.30 - 09.00"),
        kelompokDi(6, "Selasa Mgg2", "09.30 - 12.00"),
      ],
      "238": [kelompokDi(3, "Kamis Mgg1", "12.30 - 15.00")],
    };
    const { perPraktikum, tanpaMinggu } = slotJaga(
      [
        { hari: 2, slot: 2, kelas: "reguler" },
        { hari: 2, slot: 1, kelas: "reguler" },
        { hari: 4, slot: 3, kelas: "internasional" },
        { hari: 5, slot: 4, kelas: "reguler" },
      ],
      tarik,
    );
    expect(perPraktikum.get(237)).toEqual([{ minggu: 2, hari: 2, shift: [1, 2] }]);
    expect(perPraktikum.get(238)).toEqual([{ minggu: 1, hari: 4, shift: [3] }]);
    expect(tanpaMinggu).toEqual([{ hari: 5, slot: 4, kelas: "reguler" }]);
    expect(sidikJaga(perPraktikum)).toBe("237:2/2/1.2;238:1/4/3");
  });
});

describe("retries and accounts", () => {
  const t0 = new Date("2026-10-13T07:00:00Z");

  it("retries only what waiting can fix, with growing waits, then stops", () => {
    const a = setelahGagal("tak_terjangkau", 0, t0);
    expect(a).toMatchObject({ status: "antre", percobaan: 1 });
    expect(a.jalanPada.getTime() - t0.getTime()).toBe(JEDA_ULANG_DETIK[0] * 1000);
    expect(setelahGagal("seelabs_galat", 1, t0).jalanPada.getTime() - t0.getTime()).toBe(
      JEDA_ULANG_DETIK[1] * 1000,
    );
    expect(setelahGagal("tak_terjangkau", PERCOBAAN_MAKS - 1, t0).status).toBe("gagal");
    for (const kode of ["ditolak", "bentuk_berubah", "anggota_beda", "butuh_token", "segel_rusak"])
      expect(setelahGagal(kode, 0, t0).status).toBe("gagal");
  });

  it("marks an account bad only for a refused password, never for an unreachable SeeLabs", () => {
    expect(statusAksesSetelah(null, "menunggu_uji")).toBe("aktif");
    expect(statusAksesSetelah("ditolak", "aktif")).toBe("ditolak");
    expect(statusAksesSetelah("tak_terjangkau", "menunggu_uji")).toBe("menunggu_uji");
    expect(statusAksesSetelah("tak_terjangkau", "aktif")).toBe("aktif");
    expect(statusAksesSetelah("segel_rusak", "aktif")).toBe("kunci_lain");
  });
});

describe("the Pi's key and the browser seal", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");

  it("accepts only a well formed infoSistem.seelabs", () => {
    expect(
      bacaInfoSeelabs({ seelabs: { spki, sidik: "0123:4567:89AB:CDEF:0123:4567:89AB:CDEF" } })
        ?.spki,
    ).toBe(spki);
    expect(bacaInfoSeelabs({ seelabs: { spki, sidik: "bad" } })).toBeNull();
    expect(
      bacaInfoSeelabs({
        seelabs: { spki: "<script>", sidik: "0123:4567:89AB:CDEF:0123:4567:89AB:CDEF" },
      }),
    ).toBeNull();
    expect(bacaInfoSeelabs(null)).toBeNull();
  });

  it("seals {nim, sandi} so only the private key opens it", async () => {
    const sidik = await sidikKunci(spki);
    expect(sidik).toMatch(/^([0-9A-F]{4}:){7}[0-9A-F]{4}$/);
    const { segel } = await segelSandi(spki, sidik, "1101200001", sandiBawaanSeelabs("1101200001"));
    expect(Buffer.from(segel, "base64")).toHaveLength(384);
    const isi = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(segel, "base64"),
    );
    expect(JSON.parse(isi.toString())).toEqual({ nim: "1101200001", sandi: "11012000011715" });
  });

  it("refuses to seal to a key other than the approved one", async () => {
    await expect(
      segelSandi(spki, "0000:0000:0000:0000:0000:0000:0000:0000", "1", "x"),
    ).rejects.toThrow("kunci_berubah");
  });
});

describe("the Laboran default password's suffix", () => {
  it("is 1715 unless Sumber SeeLabs changed it", () => {
    expect(SUFIKS_BAWAAN).toBe("1715");
    expect(sandiBawaanSeelabs("101022300172")).toBe("1010223001721715");
    expect(sandiBawaanSeelabs("101022300172", "2026")).toBe("1010223001722026");
  });

  it("takes 1 to 16 letters or digits only", () => {
    for (const ok of ["1715", "A", "abc123XYZ", "1234567890123456"])
      expect(sufiksSah(ok)).toBe(true);
    for (const bad of ["", " 1715", "17-15", "1234567890123456x", "sandi!", 1715, null])
      expect(sufiksSah(bad)).toBe(false);
  });
});
