import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  awalSemester,
  beban,
  blokAwal,
  blokValid,
  cocok,
  geserTanggal,
  ikhtisar,
  jumlahSaringan,
  langkahDokumen,
  rentangPreset,
  SARINGAN_AWAL,
  senin,
  statusLaporan,
  urutkan,
  type SesiLaporan,
} from "../laporan";
import { jenisAudit } from "../audit-jenis";

function sesi(p: Partial<SesiLaporan> & { id: number }): SesiLaporan {
  return {
    tanggal: "2026-10-01",
    mulai: "12:30",
    slot: 3,
    modul: 3,
    kelas: "reguler",
    status: "selesai",
    jenis: "reguler",
    durasiDetik: 9000,
    pasangan: [],
    hadir: [20, 20],
    dinilai: [20, 20],
    skor: { jumlah: 0, n: 0 },
    blank: [0, 0],
    lab: { jumlah: 0, n: 0 },
    delay: { jumlah: 0, n: 0 },
    ganti: [],
    ...p,
  };
}

describe("report rows", () => {
  it("names a session running, incomplete or complete", () => {
    expect(statusLaporan(sesi({ id: 1, status: "berjalan", dinilai: [0, 20] }))).toBe("jalan");
    expect(statusLaporan(sesi({ id: 1, dinilai: [16, 20] }))).toBe("kurang");
    expect(statusLaporan(sesi({ id: 1 }))).toBe("lengkap");
  });

  it("filters on every field of the bar", () => {
    const rows = [
      sesi({ id: 1, modul: 2, pasangan: [{ nomor: 1, nim: "A" }] }),
      sesi({ id: 2, kelas: "internasional", slot: 2, tanggal: "2026-09-20" }),
      sesi({ id: 3, ganti: ["B"], dinilai: [3, 4] }),
    ];
    const f = (x: Partial<typeof SARINGAN_AWAL>) =>
      rows.filter(cocok({ ...SARINGAN_AWAL, ...x })).map((r) => r.id);
    expect(f({})).toEqual([1, 2, 3]);
    expect(f({ modul: 2 })).toEqual([1]);
    expect(f({ kelas: "internasional" })).toEqual([2]);
    expect(f({ slot: 2 })).toEqual([2]);
    expect(f({ asisten: "A" })).toEqual([1]);
    expect(f({ asisten: "B" })).toEqual([3]);
    expect(f({ status: "kurang" })).toEqual([3]);
    expect(f({ dari: "2026-09-25" })).toEqual([1, 3]);
    expect(f({ sampai: "2026-09-25" })).toEqual([2]);
    expect(
      jumlahSaringan({ ...SARINGAN_AWAL, modul: 1, kelas: "reguler", dari: "2026-01-01" }),
    ).toBe(2);
  });

  it("turns presets into date ranges", () => {
    expect(rentangPreset("7", "2026-10-03")).toEqual(["2026-09-27", "2026-10-03"]);
    expect(rentangPreset("30", "2026-10-03")).toEqual(["2026-09-04", "2026-10-03"]);
    expect(rentangPreset("sem", "2026-10-03")).toEqual(["2026-08-01", "2026-10-03"]);
    expect(rentangPreset("all", "2026-10-03")).toEqual([null, null]);
    expect(awalSemester("2027-01-10")).toBe("2026-08-01");
    expect(awalSemester("2027-03-10")).toBe("2027-02-01");
    expect(geserTanggal("2026-03-01", -1)).toBe("2026-02-28");
    expect(senin("2026-10-03")).toBe("2026-09-28");
    expect(senin("2026-09-28")).toBe("2026-09-28");
  });

  it("sums the overview from counts, not averages of averages", () => {
    const o = ikhtisar([
      sesi({
        id: 1,
        hadir: [18, 20],
        skor: { jumlah: 800, n: 10 },
        blank: [9, 10],
        lab: { jumlah: 8, n: 2 },
      }),
      sesi({
        id: 2,
        hadir: [10, 10],
        skor: { jumlah: 90, n: 1 },
        blank: [1, 10],
        lab: { jumlah: 5, n: 1 },
        kelas: "internasional",
      }),
    ]);
    expect(o.hadir).toBeCloseTo(28 / 30);
    expect(o.skorRata).toBeCloseTo(890 / 11);
    expect(o.blank).toBeCloseTo(0.5);
    expect(o.labRata).toBeCloseTo(13 / 3);
    expect(o.perModul[2]).toEqual({ modul: 3, reguler: 80, internasional: 90 });
    expect(ikhtisar([]).hadir).toBeNull();
  });

  it("counts workload, double groups and covers", () => {
    const b = beban(
      [
        sesi({
          id: 1,
          tanggal: "2026-10-01",
          pasangan: [
            { nomor: 1, nim: "A" },
            { nomor: 2, nim: "A" },
            { nomor: 3, nim: "B" },
          ],
        }),
        sesi({ id: 2, tanggal: "2026-09-20", pasangan: [{ nomor: 1, nim: "B" }], ganti: ["C"] }),
      ],
      "2026-10-03",
    );
    const a = b.find((x) => x.nim === "A")!;
    expect(a).toEqual({ nim: "A", minggu: 1, sesi: 1, kelompok: 2, ganda: 1, ganti: 0 });
    expect(b.find((x) => x.nim === "B")).toMatchObject({
      sesi: 2,
      kelompok: 2,
      minggu: 1,
      ganda: 0,
    });
    expect(b.find((x) => x.nim === "C")).toMatchObject({ sesi: 1, kelompok: 0, ganti: 1 });
  });

  it("sorts by a column either way", () => {
    const rows = [sesi({ id: 1, modul: 2 }), sesi({ id: 2, modul: 4 }), sesi({ id: 3, modul: 1 })];
    expect(urutkan(rows, "modul", 1).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(urutkan(rows, "modul", -1).map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

describe("written reports", () => {
  it("accepts only blocks this editor writes", () => {
    expect(blokValid({ id: "b1", k: "p", v: "x" })).toBe(true);
    expect(blokValid({ id: "b1", k: "chart", v: {} })).toBe(true);
    expect(blokValid({ id: "", k: "p" })).toBe(false);
    expect(blokValid({ id: "b1", k: "script" })).toBe(false);
    expect(blokValid(null)).toBe(false);
  });

  it("gives requests two more steps and every type starter blocks", () => {
    expect(langkahDokumen("permintaan")).toEqual(["draf", "terkirim", "diproses", "selesai"]);
    expect(langkahDokumen("sesi")).toEqual(["draf", "terkirim"]);
    let n = 0;
    for (const j of ["sesi", "kerusakan", "permintaan", "lainnya"] as const) {
      const b = blokAwal(j, () => `b${n++}`);
      expect(b.length).toBeGreaterThan(0);
      expect(b.every(blokValid)).toBe(true);
    }
  });

  it("files audit lines under their tab", () => {
    expect(jenisAudit("penugasan_ubah", {})).toBe("pair");
    expect(jenisAudit("transfer_tandai", {})).toBe("seelabs");
    expect(jenisAudit("tim_ubah", { status: "cuti" })).toBe("tim");
    expect(jenisAudit("tim_ubah", { hakOverride: {} })).toBe("hak");
    expect(jenisAudit("konsol_buka", {})).toBe("konsol");
    expect(jenisAudit("sesi_mulai", {})).toBe("lain");
  });
});

describe("Mandarin PDF font", () => {
  it("covers every CJK character the app's source writes", () => {
    const root = join(__dirname, "..", "..");
    const covered = new Set(
      readFileSync(join(root, "..", "public", "fonts", "pdf-sc.chars.txt"), "utf8"),
    );
    const missing = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|astro)$/.test(f))
          for (const c of readFileSync(p, "utf8").match(/[　-〿㐀-䶿一-鿿＀-￯]/g) ?? [])
            if (!covered.has(c)) missing.add(c);
      }
    };
    walk(root);
    // Run `python scripts/subset_pdf_cjk.py <NotoSansSC[wght].ttf>` to refresh.
    expect([...missing].join("")).toBe("");
  });
});
