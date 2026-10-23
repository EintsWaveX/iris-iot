import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  BERKAS_MODUL,
  bantuanCelah,
  bantuanUntuk,
  cekCelah,
  kanonik,
  kenapaCelah,
  kodeBawaan,
  kodeV1,
  lengkapiDariV1,
} from "../kode-aktif";
import {
  buatTemplat,
  cariPadanan,
  celahBaru,
  periksaBerkas,
  pindahkanCelah,
  rapikanNomor,
  type KodeBerkas,
} from "../../../src/lib/kode-jurnal";
import { personalize } from "../../../src/lib/group-identity";

const teksId = (x: { id: string } | undefined) => x?.id ?? "";

const SKETCHES = fileURLToPath(new URL("../../../src/content/sketches/", import.meta.url));
const bundled = (bahasa: string, p: string) =>
  readFileSync(path.join(SKETCHES, bahasa, p), "utf-8");

describe("version 1 from the bundled files", () => {
  for (const modul of [1, 2, 3, 4]) {
    for (const b of kodeV1(modul)) {
      it(`m${modul} ${b.path}: the generated Praktikan files are the bundled ones`, () => {
        expect(buatTemplat(b, "id")).toBe(bundled("id", b.path));
        expect(buatTemplat(b, "en")).toBe(bundled("en", b.path));
      });
      it(`m${modul} ${b.path}: no blocking problems, identity line intact`, () => {
        expect(periksaBerkas(b).filter((m) => m.berat)).toEqual([]);
        for (const bahasa of ["id", "en"] as const) {
          expect(() => personalize(b.slug, b.sumber[bahasa], 3)).not.toThrow();
        }
      });
      it(`m${modul} ${b.path}: every id span finds its en twin`, () => {
        for (const c of b.celah) {
          expect(cariPadanan(b.sumber.id, c.posisi.id!, b.sumber.en, b.path)).toEqual(c.posisi.en);
        }
      });
    }
  }

  it("covers every module file", () => {
    expect(Object.values(BERKAS_MODUL).flat()).toHaveLength(8);
  });
});

describe("checking against version 1", () => {
  const m1 = kodeBawaan(1);
  const m2 = kodeBawaan(2);

  it("accepts the answer and its other spellings, case and spaces aside", () => {
    expect(cekCelah(m1, "modul1_ble_central", 1, " blescan.H ", 1, "id")).toMatchObject({
      benar: true,
    });
    expect(cekCelah(m1, "modul1_ble_central", 4, "BLEUUID(SERVICE_UUID)", 1, "id")).toMatchObject({
      benar: true,
    });
    expect(cekCelah(m1, "modul1_ble_central", 4, "UUID", 1, "id")).toMatchObject({ benar: false });
  });

  it("per-group answers follow the group", () => {
    expect(cekCelah(m2, "modul2_websocket_esp32", 2, "/grup3", 3, "id")).toMatchObject({
      benar: true,
    });
    expect(cekCelah(m2, "modul2_websocket_esp32", 2, "/grup1", 3, "id")).toMatchObject({
      benar: false,
    });
    expect(kanonik(m2, "modul2_websocket_esp32", 2, 4)).toBe("/grup4");
  });

  it("gives the why line only when correct, and nothing for an unknown blank", () => {
    expect(cekCelah(m1, "modul1_ble_central", 2, "digitalRead", 1, "en")).toMatchObject({
      kenapa: expect.stringMatching(/pressed/),
    });
    expect(cekCelah(m1, "modul1_ble_central", 2, "x", 1, "id")).toEqual({
      ditemukan: true,
      benar: false,
      kenapa: undefined,
    });
    expect(cekCelah(m1, "modul1_ble_central", 99, "x", 1, "id")).toEqual({ ditemukan: false });
  });
});

describe("explanations and hints", () => {
  it("every version 1 blank has both, in id, en and zh, and no hint gives the answer", () => {
    for (const modul of [1, 2, 3, 4]) {
      const k = kodeBawaan(modul);
      for (const [slug, b] of k.berkas) {
        for (const c of b.urut) {
          for (const lang of ["id", "en", "zh"] as const) {
            expect(kenapaCelah(k, slug, c.nomor, lang), `${slug} (${c.nomor}) ${lang}`).not.toBe(
              "",
            );
            const hint = bantuanCelah(k, slug, c.nomor, lang);
            expect(hint, `${slug} (${c.nomor}) ${lang}`).not.toBe("");
            const sebut = hint.split(/[^\w./{}"]+/).includes(c.jawaban);
            expect(sebut, `${slug} (${c.nomor}) ${lang} hint names the answer`).toBe(false);
          }
        }
      }
    }
  });

  it("no dashes in the copy", () => {
    for (const modul of [1, 2, 3, 4])
      for (const b of kodeBawaan(modul).berkas.values())
        for (const c of b.urut)
          expect(JSON.stringify([c.kenapa, c.bantuan1, c.bantuan, c.bantuan3])).not.toMatch(/[–—]/);
  });

  it("every version 1 blank has a light and a direct hint, and the light one never names the answer", () => {
    for (const modul of [1, 2, 3, 4]) {
      const k = kodeBawaan(modul);
      for (const [slug, b] of k.berkas) {
        for (const c of b.urut) {
          for (const lang of ["id", "en", "zh"] as const) {
            const satu = bantuanCelah(k, slug, c.nomor, lang, 1);
            expect(satu, `${slug} (${c.nomor}) ${lang}`).not.toBe("");
            expect(
              bantuanCelah(k, slug, c.nomor, lang, 3),
              `${slug} (${c.nomor}) ${lang}`,
            ).not.toBe("");
            const sebut = satu.split(/[^\w./{}"]+/).includes(c.jawaban);
            expect(sebut, `${slug} (${c.nomor}) ${lang} light hint names the answer`).toBe(false);
          }
        }
      }
    }
  });

  it("opens one tier per wrong try, and the answer with the third", () => {
    const k = kodeBawaan(1);
    const f = "modul1_ble_central";
    expect(bantuanUntuk(k, f, 2, "id", 0, 1)).toBeNull();
    expect(bantuanUntuk(k, f, 2, "id", 1, 1)).toEqual({
      teks: bantuanCelah(k, f, 2, "id", 1),
      tingkat: 1,
    });
    expect(bantuanUntuk(k, f, 2, "en", 2, 1)).toEqual({
      teks: bantuanCelah(k, f, 2, "en", 2),
      tingkat: 2,
    });
    for (const salah of [3, 7])
      expect(bantuanUntuk(k, f, 2, "zh", salah, 1)).toEqual({
        teks: bantuanCelah(k, f, 2, "zh", 3),
        tingkat: 3,
        jawaban: "digitalRead",
      });
    // A per-group answer is the group's own.
    expect(bantuanUntuk(kodeBawaan(2), "modul2_websocket_esp32", 2, "id", 3, 3)?.jawaban).toBe(
      "/grup3",
    );
    expect(bantuanUntuk(k, f, 99, "id", 3, 1)).toBeNull();
  });

  it("a tier with no text falls back to the one below it", () => {
    const [b] = kodeV1(3);
    const tanpa: KodeBerkas = {
      ...b,
      celah: b.celah.map((c) => ({ ...c, jawaban: `${c.jawaban}x`, bantuan3: { id: "", en: "" } })),
    };
    const k = {
      modul: 3,
      versi: 2,
      pin: false,
      berkas: new Map([
        [b.slug, { berkas: tanpa, urut: tanpa.celah, templat: { id: "", en: "" } }],
      ]),
    };
    const h = bantuanUntuk(k, b.slug, 1, "id", 3, 1);
    expect(h?.teks).toBe(teksId(tanpa.celah[0].bantuan));
    expect(h?.tingkat).toBe(3);
    expect(h?.jawaban).toBe(`${b.celah[0].jawaban}x`);
  });

  it("a version saved before hints existed takes version 1's hint while the answer is the same", () => {
    const [b] = kodeV1(3);
    const lama: KodeBerkas = {
      ...b,
      celah: b.celah.map(({ bantuan: _, ...c }, i) =>
        i === 1
          ? { ...c, jawaban: "lain" }
          : { ...c, kenapa: { id: c.kenapa.id, en: c.kenapa.en } },
      ),
    };
    const baru = lengkapiDariV1(3, lama);
    expect(baru.celah[0].bantuan?.id).toBe(b.celah[0].bantuan?.id);
    expect(baru.celah[0].kenapa.zh).toBe(b.celah[0].kenapa.zh);
    expect(baru.celah[1].bantuan).toBeUndefined();
  });

  it("an Indonesian text still version 1's takes the English and Mandarin it is missing", () => {
    const [b] = kodeV1(3);
    const lama: KodeBerkas = {
      ...b,
      celah: b.celah.map((c, i) => ({
        ...c,
        kenapa: { id: i === 1 ? "ditulis sendiri" : c.kenapa.id, en: "" },
        bantuan: { id: c.bantuan?.id ?? "", en: i === 2 ? "my own" : "" },
      })),
    };
    const baru = lengkapiDariV1(3, lama);
    expect(baru.celah[0].kenapa.en).toBe(b.celah[0].kenapa.en);
    expect(baru.celah[0].kenapa.zh).toBe(b.celah[0].kenapa.zh);
    expect(baru.celah[0].bantuan?.zh).toBe(b.celah[0].bantuan?.zh);
    expect(baru.celah[1].kenapa).toEqual({ id: "ditulis sendiri", en: "" });
    expect(baru.celah[2].bantuan?.en).toBe("my own");
  });
});

function contoh(): KodeBerkas {
  return {
    slug: "uji",
    path: "uji.py",
    sumber: {
      id: 'PORT = 8765  # nomor port\nprint("# bukan komentar", PORT)\nHOST = "x"\n',
      en: 'PORT = 8765  # port number\nprint("# bukan komentar", PORT)\nHOST = "x"\n',
    },
    celah: [],
  };
}

describe("marking blanks", () => {
  it("a new blank takes the line's comment as its hint and finds the en twin", () => {
    const b = contoh();
    const c = celahBaru(b, "id", { awal: 7, akhir: 11 });
    expect(c.jawaban).toBe("8765");
    expect(c.posisi.en).toEqual({ awal: 7, akhir: 11 });
    expect(c.petunjuk).toEqual({ id: "nomor port", en: "port number" });
    b.celah.push(c);
    expect(buatTemplat(b, "en").split("\n")[0]).toBe("PORT = ________  # (1) port number");
  });

  it("a blank on a line without a comment gets one, and # inside a string is not one", () => {
    const b = contoh();
    const at = b.sumber.id.indexOf("PORT)");
    b.celah.push({
      ...celahBaru(b, "id", { awal: at, akhir: at + 4 }),
      petunjuk: { id: "h", en: "h" },
    });
    expect(buatTemplat(b, "id").split("\n")[1]).toBe(
      'print("# bukan komentar", ________)  # (1) h',
    );
  });

  it("a new blank takes the next number, renumbering closes gaps, two on a line are refused", () => {
    const b = contoh();
    const host = b.sumber.id.indexOf('"x"');
    b.celah.push(celahBaru(b, "id", { awal: host, akhir: host + 3 }));
    b.celah.push(celahBaru(b, "id", { awal: 7, akhir: 11 }));
    const baris = buatTemplat(b, "id").split("\n");
    expect(baris[2]).toBe("HOST = ________  # (1)");
    expect(baris[0]).toBe("PORT = ________  # (2) nomor port");
    b.celah.push(celahBaru(b, "id", { awal: 0, akhir: 4 }));
    expect(periksaBerkas(b).map((m) => m.kode)).toContain("satu_baris");
    const tanpaSatu = rapikanNomor(b.celah.filter((c) => c.nomor !== 1));
    expect(tanpaSatu.map((c) => c.nomor)).toEqual([1, 2]);
  });

  it("spans move with a replaced file and are reported when their line is gone", () => {
    const b = contoh();
    b.celah.push(celahBaru(b, "id", { awal: 7, akhir: 11 }));
    const baru = "# kepala baru\n" + b.sumber.id;
    const { celah, hilang } = pindahkanCelah(b, "id", baru);
    expect(hilang).toEqual([]);
    expect(baru.slice(celah[0].posisi.id!.awal, celah[0].posisi.id!.akhir)).toBe("8765");
    expect(pindahkanCelah(b, "id", "PORT = 9000\n").hilang).toEqual([b.celah[0].id]);
  });

  it("a file with no blanks may be published, and its template is the source itself", () => {
    const b = contoh();
    expect(periksaBerkas(b)).toEqual([]);
    expect(buatTemplat(b, "id")).toBe(b.sumber.id);
    expect(buatTemplat(b, "en")).toBe(b.sumber.en);
  });

  it("a blank missing in one language blocks publishing", () => {
    const b = contoh();
    b.sumber.en = "PORT = 1234\n";
    b.celah.push(celahBaru(b, "id", { awal: 7, akhir: 11 }));
    expect(periksaBerkas(b)).toContainEqual(
      expect.objectContaining({ kode: "belum_ditandai", bahasa: "en", berat: true }),
    );
  });
});
