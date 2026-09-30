import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { langForKelas, resolveLang, pathForLang, isKelas } from "../kelas";
import { bagiKelompok, bolehIsiNilai, jumlahPegangan } from "../penugasan";
import { buildJadwal, parseGrid, hariDariTanggal, semesterDariTanggal } from "../jadwal-parser";
import { validasiUmpanBalik, ringkas } from "../umpan-balik";
import { langkahBerikutnya } from "../langkah";
import { SESI_CAP_MENIT } from "../jadwal";

describe("session cap stays in sync with the Module 4 hunt server", () => {
  it("SESI_DURASI_SEC in apps/modul4/server.py equals SESI_CAP_MENIT", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../../modul4/server.py", import.meta.url)),
      "utf-8",
    );
    const m = src.match(/^SESI_DURASI_SEC = (\d+) \* 60/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(SESI_CAP_MENIT);
    expect(SESI_CAP_MENIT).toBe(150);
  });
});

describe("kelas and language", () => {
  it("maps class type to its default language", () => {
    expect(langForKelas("reguler")).toBe("id");
    expect(langForKelas("internasional")).toBe("en");
    expect(langForKelas(null)).toBe("id");
  });
  it("lets a personal choice override the class default", () => {
    expect(resolveLang("id", "internasional")).toBe("id");
    expect(resolveLang("en", "reguler")).toBe("en");
    expect(resolveLang("fr", "internasional")).toBe("en");
    expect(resolveLang(undefined, undefined)).toBe("id");
  });
  it("maps a path to the same page in the other language", () => {
    expect(pathForLang("/modules/2/live", "en")).toBe("/en/modules/2/live");
    expect(pathForLang("/en/modules/2/live", "id")).toBe("/modules/2/live");
    expect(pathForLang("/", "en")).toBe("/en/");
    expect(pathForLang("/en/", "id")).toBe("/");
    expect(pathForLang("/en", "id")).toBe("/");
    expect(pathForLang("/session?x=1#nilai", "en")).toBe("/en/session?x=1#nilai");
    expect(pathForLang("/en/session#nilai", "en")).toBe("/en/session#nilai");
  });
  it("recognises only the two class types", () => {
    expect(isKelas("reguler")).toBe(true);
    expect(isKelas("internasional")).toBe(true);
    expect(isKelas("inter")).toBe(false);
  });
});

describe("group assignment", () => {
  const G = [1, 2, 3, 4, 5];
  it("gives one group each when there are five assistants", () => {
    const m = bagiKelompok(["NAT", "DES", "GRY", "WIL", "LUV"], G);
    expect([...m.values()]).toEqual(["NAT", "DES", "GRY", "WIL", "LUV"]);
  });
  it("splits five groups over three assistants as 2, 2, 1 in contiguous blocks", () => {
    const m = bagiKelompok(["TIR", "NUE", "OCU"], G);
    expect(G.map((g) => m.get(g))).toEqual(["TIR", "TIR", "NUE", "NUE", "OCU"]);
    expect(jumlahPegangan(m).get("TIR")).toBe(2);
  });
  it("splits five groups over four assistants as 2, 1, 1, 1", () => {
    const m = bagiKelompok(["GAN", "ICA", "MAP", "MCD"], G);
    expect(G.map((g) => m.get(g))).toEqual(["GAN", "GAN", "ICA", "MAP", "MCD"]);
  });
  it("handles no assistants and extra assistants", () => {
    expect(bagiKelompok([], G).size).toBe(0);
    expect([...bagiKelompok(["A", "B", "C", "D", "E", "F"], G).values()]).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });
  it("lets only the holder write an assigned group, anyone an unassigned one", () => {
    const owners = new Map([[1, "111"]]);
    expect(bolehIsiNilai(owners, 1, "111")).toBe(true);
    expect(bolehIsiNilai(owners, 1, "222")).toBe(false);
    expect(bolehIsiNilai(owners, 2, "222")).toBe(true);
  });
});

/* The odd-semester sheet, as a copy of its ASISTEN DEFAULT block would
   paste: a title row, day names, the INTER / Soon marker row, slot numbers,
   the five assistant rows and the count row with its label column. */
const DAYS = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
const GRID: (string[] | null | "soon" | { inter: string[] })[] = [
  null,
  null,
  null,
  null,
  ["NAT", "ICA", "MCU", "LUV", "MCD"],
  null,
  null,
  null,
  null,
  null,
  ["ADD", "TWT", "IKY", "TRA", "XIN"],
  ["NAB", "WIL", "BAR", "GMW", "TRA"],
  ["TWT", "OCU", "MAP", "MCD", "TIR"],
  { inter: ["TIR", "NUE", "OCU"] },
  ["YEN", "ADD", "REG", "NUE", "MAP"],
  ["NAB", "DES", "ZAN", "LYY", "REG"],
  ["GMW", "BAR", "XIN", "YEN", "TRA"],
  ["NAT", "DES", "GRY", "WIL", "LUV"],
  ["ZAN", "IKY", "GRY", "GMW", "MCU"],
  ["LYY", "XIN", "NUE", "ICA", "WIL"],
  "soon",
  ["GAN", "ICA", "MAP", "MCD"],
  ["NAB", "ADD", "BAR", "OCU", "GAN"],
  null,
];
function sheetTsv(): string {
  const rows: string[] = [];
  rows.push(["", "ASISTEN DEFAULT", ...Array(23).fill("")].join("\t"));
  rows.push(["", ...DAYS.flatMap((d) => [d, "", "", ""])].join("\t"));
  rows.push(
    ["", ...GRID.map((c) => (c === "soon" ? "Soon" : c && !Array.isArray(c) ? "INTER" : ""))].join(
      "\t",
    ),
  );
  rows.push(["", ...DAYS.flatMap(() => ["1", "2", "3", "4"])].join("\t"));
  for (let r = 0; r < 5; r++) {
    rows.push(
      [
        "",
        ...GRID.map((c) =>
          Array.isArray(c) ? (c[r] ?? "") : c && c !== "soon" ? (c.inter[r] ?? "") : "",
        ),
      ].join("\t"),
    );
  }
  rows.push(
    ["Jumlah Asisten", ...GRID.map((c) => (Array.isArray(c) ? String(c.length) : ""))].join("\t"),
  );
  return rows.join("\r\n");
}

describe("schedule paste parser", () => {
  it("reads every scheduled slot from the real sheet layout", () => {
    const { slot, asing } = buildJadwal(sheetTsv());
    expect(asing).toEqual([]);
    expect(slot).toHaveLength(14); // 13 with assistants + Saturday slot 1 "Soon"
    const s = (h: number, sl: number) => slot.find((x) => x.hari === h && x.slot === sl);
    expect(s(2, 1)?.asisten).toEqual(["NAT", "ICA", "MCU", "LUV", "MCD"]);
    expect(s(1, 1)).toBeUndefined();
    expect(s(4, 2)).toMatchObject({
      kelas: "internasional",
      status: "aktif",
      asisten: ["TIR", "NUE", "OCU"],
    });
    expect(s(6, 1)).toMatchObject({ status: "segera", asisten: [] });
    expect(s(6, 2)?.asisten).toEqual(["GAN", "ICA", "MAP", "MCD"]);
    expect(slot.filter((x) => x.kelas === "internasional")).toHaveLength(1);
  });
  it("attaches ranked substitutes and flags unknown codes", () => {
    // Numbering column + 24 slot columns; Jumat slot 2 is slot column 17.
    const row = (n: string, kode: string) => {
      const cells = [n, ...Array<string>(24).fill("")];
      cells[1 + 17] = kode;
      return cells.join("\t");
    };
    const peng = [row("1", "NAB"), row("2", "ADD")].join("\n");
    const { slot, kodeTakDikenal } = buildJadwal(sheetTsv(), peng, [
      "NAT",
      "DES",
      "GRY",
      "WIL",
      "LUV",
      "NAB",
    ]);
    const jumat2 = slot.find((x) => x.hari === 5 && x.slot === 2);
    expect(jumat2?.pengganti).toEqual([
      { kode: "NAB", tag: null },
      { kode: "ADD", tag: null },
    ]);
    expect(kodeTakDikenal).toContain("ADD");
    expect(kodeTakDikenal).not.toContain("NAT");
  });
  it("reports cells that are not assistant codes", () => {
    expect(parseGrid("NAT\tico123").asing).toEqual(["ICO123"]);
  });
  it("derives weekday and semester from a date", () => {
    expect(hariDariTanggal("2026-10-02")).toBe(5); // Jumat
    expect(semesterDariTanggal("2026-09-29")).toBe("2026-ganjil");
    expect(semesterDariTanggal("2027-01-10")).toBe("2026-ganjil");
    expect(semesterDariTanggal("2027-03-01")).toBe("2027-genap");
  });
});

describe("feedback", () => {
  const ok = {
    asistenNim: "111",
    ratingAsisten: 4,
    ratingLab: 5,
    chipsAsisten: ["jelas", "jelas"],
    chipsLab: [],
  };
  it("accepts a valid form and dedupes chips", () => {
    const r = validasiUmpanBalik(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.chipsAsisten).toEqual(["jelas"]);
  });
  it("rejects bad ratings, unknown chips and long comments", () => {
    expect(validasiUmpanBalik({ ...ok, ratingAsisten: 6 }).ok).toBe(false);
    expect(validasiUmpanBalik({ ...ok, ratingLab: 2.5 }).ok).toBe(false);
    expect(validasiUmpanBalik({ ...ok, chipsLab: ["jelas"] }).ok).toBe(false);
    expect(validasiUmpanBalik({ ...ok, komentarLab: "x".repeat(501) }).ok).toBe(false);
    expect(validasiUmpanBalik({ ...ok, asistenNim: "" }).ok).toBe(false);
  });
  it("wants a reason for a rating of 1 or 2", () => {
    const low = { ...ok, ratingLab: 1 };
    // The 2026-09-30 test: one star with keyboard mash was accepted.
    expect(validasiUmpanBalik({ ...low, komentarLab: "asdfghjkl" })).toEqual({
      ok: false,
      kode: "butuh_alasan",
      bagian: "lab",
    });
    expect(validasiUmpanBalik({ ...low, komentarLab: "sdf ghj klm" }).ok).toBe(false);
    expect(validasiUmpanBalik(low).ok).toBe(false);
    expect(validasiUmpanBalik({ ...low, chipsLab: ["alat_rusak"] }).ok).toBe(true);
    expect(validasiUmpanBalik({ ...low, komentarLab: "Wi-Fi putus terus" }).ok).toBe(true);
    // A 3 needs nothing extra.
    expect(validasiUmpanBalik({ ...ok, ratingLab: 3 }).ok).toBe(true);
  });
  it("summarises without any author", () => {
    const d = (s: string) => new Date(s);
    const r = ringkas([
      { rating: 5, komentar: "Mantap", chips: ["jelas", "sabar"], pada: d("2026-09-29T03:00:00Z") },
      { rating: 4, komentar: null, chips: ["jelas"], pada: d("2026-09-29T03:05:00Z") },
      { rating: 3, komentar: "Lambat", chips: [], pada: d("2026-09-29T03:10:00Z") },
    ]);
    expect(r.jumlah).toBe(3);
    expect(r.rataRata).toBe(4);
    expect(r.sebaran).toEqual([0, 0, 1, 1, 1]);
    expect(r.chips[0]).toEqual({ chip: "jelas", n: 2 });
    expect(r.komentar.map((k) => k.teks)).toEqual(["Lambat", "Mantap"]);
    expect(JSON.stringify(r)).not.toMatch(/nim/i);
    expect(ringkas([]).rataRata).toBeNull();
  });
});

describe("next step", () => {
  const base = {
    sesi: { modul: 2, selesai: false },
    terbuka: [1, 2],
    progres: { 2: { benar: 6, total: 12 } },
    persiapanSelesai: true,
    sudahUmpanBalik: false,
  };
  it("walks setup, code, live, then feedback", () => {
    expect(langkahBerikutnya({ ...base, persiapanSelesai: false })).toEqual({
      jenis: "persiapan",
      modul: 2,
    });
    expect(langkahBerikutnya(base)).toEqual({ jenis: "kode", modul: 2, sisa: 6 });
    expect(langkahBerikutnya({ ...base, progres: { 2: { benar: 12, total: 12 } } })).toEqual({
      jenis: "live",
      modul: 2,
    });
    expect(langkahBerikutnya({ ...base, sesi: { modul: 2, selesai: true } })).toEqual({
      jenis: "umpan_balik",
      modul: 2,
    });
    expect(
      langkahBerikutnya({ ...base, sesi: { modul: 2, selesai: true }, sudahUmpanBalik: true }),
    ).toEqual({ jenis: "selesai", modul: 2 });
  });
  it("waits when there is no session or its module is still locked", () => {
    expect(langkahBerikutnya({ ...base, sesi: null })).toEqual({ jenis: "tunggu" });
    expect(langkahBerikutnya({ ...base, terbuka: [1] })).toEqual({ jenis: "tunggu" });
  });
});
