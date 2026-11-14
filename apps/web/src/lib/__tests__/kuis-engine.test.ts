import { describe, expect, it } from "vitest";
import { SOAL_MODUL4 } from "../../content/kuis/modul4";
import {
  MS_HITUNG,
  RuangKuis,
  bangunDek,
  hitungPoin,
  type LihatHost,
  type LihatPemain,
} from "../kuis/engine";
import { PENGATURAN_AWAL, type SoalKuis } from "../kuis/types";

function dasar(pilihan = 4) {
  let t = 1_000_000;
  const jam = {
    now: () => t,
    maju: (ms: number) => {
      t += ms;
    },
  };
  const bank: SoalKuis[] = [1, 2, 3].map((n) => ({
    id: `x${n}`,
    tipe: "A",
    nomor: n,
    benar: n % pilihan,
    teks: { id: `Soal ${n}`, en: `Question ${n}` },
    pilihan: {
      id: Array.from({ length: pilihan }, (_, i) => `i${n}${i}`),
      en: Array.from({ length: pilihan }, (_, i) => `e${n}${i}`),
    },
    penjelasan: { id: `Jawab ${n}`, en: `Answer ${n}` },
  }));
  const r = new RuangKuis({ sesiId: 7, soal: bank, now: jam.now, acak: () => 0 });
  return { r, jam, bank };
}

const host = (r: RuangKuis) => r.lihat(null, "host", "id") as LihatHost;
const pemain = (r: RuangKuis, nim: string, b: "id" | "en" = "id") =>
  r.lihat(nim, "pemain", b) as LihatPemain;

function mainkanSampaiSoal(r: RuangKuis, jam: { maju: (ms: number) => void }) {
  expect(r.mulai()).toEqual({ ok: true });
  jam.maju(MS_HITUNG);
  r.tick();
  expect(r.faseSaatIni).toBe("soal");
}

describe("scoring", () => {
  it("gives full points at once and half at the last moment", () => {
    expect(hitungPoin(0, 20_000)).toBe(1000);
    expect(hitungPoin(10_000, 20_000)).toBe(750);
    expect(hitungPoin(20_000, 20_000)).toBe(500);
    expect(hitungPoin(99_000, 20_000)).toBe(500);
  });

  it("scores a right answer by speed and adds a growing streak bonus", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: 1 });
    r.gabung({ nim: "2", nama: "Budi", kelompok: 2 });
    r.atur({ detik: 20, jumlah: 3, acak: false });
    mainkanSampaiSoal(r, jam);
    // Q1: benar = 1
    jam.maju(5_000);
    expect(r.jawab("1", 1)).toEqual({ ok: true });
    expect(host(r).papan.find((b) => b.nim === "1")?.skor).toBe(hitungPoin(5_000, 20_000));
    r.jawab("2", 0);
    expect(r.faseSaatIni).toBe("buka"); // everyone answered
    r.lanjut(); // papan
    r.lanjut(); // hitung Q2
    jam.maju(MS_HITUNG);
    r.tick();
    jam.maju(0);
    r.jawab("1", 2); // Q2 benar = 2, streak 2 gives +100
    const hasil = pemain(r, "1");
    expect(hasil.saya?.skor).toBe(hitungPoin(5_000, 20_000) + 1000 + 100);
  });

  it("resets the streak on a wrong answer and on no answer", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.gabung({ nim: "2", nama: "Budi", kelompok: null });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    r.jawab("1", 1);
    r.jawab("2", 1);
    expect(host(r).papan.every((b) => b.streak === 1)).toBe(true);
    r.lanjut();
    r.lanjut();
    jam.maju(MS_HITUNG);
    r.tick();
    r.jawab("1", 0); // wrong
    jam.maju(21_000); // Budi never answers
    r.tick();
    expect(host(r).papan.every((b) => b.streak === 0)).toBe(true);
  });
});

describe("room rules", () => {
  it("needs a player online before it starts, and only starts from the lobby", () => {
    const { r } = dasar();
    expect(r.mulai()).toEqual({ ok: false, galat: "tanpa-pemain" });
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    expect(r.mulai()).toEqual({ ok: true });
    expect(r.mulai()).toEqual({ ok: false, galat: "bukan-lobi" });
    expect(r.atur({ detik: 30 })).toEqual({ ok: false, galat: "bukan-lobi" });
  });

  it("clamps and validates the settings", () => {
    const { r } = dasar();
    r.atur({ detik: 999, jumlah: 999 });
    expect(host(r).pengaturan).toMatchObject({ detik: 60, jumlah: 3 });
    r.atur({ detik: 1, jumlah: 0 });
    expect(host(r).pengaturan).toMatchObject({ detik: 10, jumlah: 1 });
    expect(r.atur({ sumber: "Z" as never })).toEqual({ ok: false, galat: "pengaturan-salah" });
  });

  it("takes only the first answer, rejects bad options and late answers", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.gabung({ nim: "2", nama: "Budi", kelompok: null });
    expect(r.jawab("1", 0)).toEqual({ ok: false, galat: "fase-salah" });
    mainkanSampaiSoal(r, jam);
    expect(r.jawab("1", 9)).toEqual({ ok: false, galat: "pilihan-salah" });
    expect(r.jawab("1", "1")).toEqual({ ok: false, galat: "pilihan-salah" });
    expect(r.jawab("1", 1.5)).toEqual({ ok: false, galat: "pilihan-salah" });
    expect(r.jawab("1", 0)).toEqual({ ok: true });
    expect(r.jawab("1", 1)).toEqual({ ok: false, galat: "sudah-jawab" });
    expect(r.jawab("9", 1)).toEqual({ ok: false, galat: "bukan-pemain" });
    jam.maju(20_001);
    expect(r.jawab("2", 1)).toEqual({ ok: false, galat: "terlambat" });
  });

  it("ends the question by itself when the time is up", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    mainkanSampaiSoal(r, jam);
    jam.maju(19_000);
    expect(r.tick()).toBe(false);
    jam.maju(1_000);
    expect(r.tick()).toBe(true);
    expect(r.faseSaatIni).toBe("buka");
  });

  it("does not wait for a player who left", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.gabung({ nim: "2", nama: "Budi", kelompok: null });
    mainkanSampaiSoal(r, jam);
    r.putus("2");
    r.jawab("1", 0);
    expect(r.faseSaatIni).toBe("buka");
  });

  it("pauses and resumes the clock", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    mainkanSampaiSoal(r, jam);
    jam.maju(5_000);
    expect(r.jeda()).toEqual({ ok: true });
    jam.maju(60_000);
    expect(r.tick()).toBe(false);
    expect(r.jawab("1", 0)).toEqual({ ok: false, galat: "dijeda" });
    r.teruskan();
    jam.maju(14_000);
    expect(r.tick()).toBe(false);
    jam.maju(1_000);
    expect(r.tick()).toBe(true);
  });

  it("walks the phases to the podium and lets the host play again", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: 1 });
    r.atur({ jumlah: 2, acak: false });
    mainkanSampaiSoal(r, jam);
    r.jawab("1", 1);
    expect(r.faseSaatIni).toBe("buka");
    r.lanjut();
    expect(r.faseSaatIni).toBe("papan");
    r.lanjut();
    expect(r.faseSaatIni).toBe("hitung");
    jam.maju(MS_HITUNG);
    r.tick();
    r.lanjut(); // skip: ends the question
    expect(r.faseSaatIni).toBe("buka");
    r.lanjut(); // last question: straight to the podium
    expect(r.faseSaatIni).toBe("podium");
    expect(r.hasilAkhir()[0]).toMatchObject({ nim: "1", peringkat: 1 });
    expect(r.mainLagi()).toEqual({ ok: true });
    expect(host(r).fase).toBe("lobi");
    expect(host(r).papan[0].skor).toBe(0);
  });

  it("lets the host end the game early", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    expect(r.akhiri()).toEqual({ ok: false, galat: "fase-salah" });
    mainkanSampaiSoal(r, jam);
    expect(r.akhiri()).toEqual({ ok: true });
    expect(r.faseSaatIni).toBe("podium");
  });

  it("caps the room and lets a known player come back", () => {
    const { r } = dasar();
    for (let i = 0; i < 120; i++) r.gabung({ nim: `n${i}`, nama: "x", kelompok: null });
    expect(r.gabung({ nim: "extra", nama: "x", kelompok: null })).toEqual({
      ok: false,
      galat: "penuh",
    });
    r.putus("n3");
    expect(r.gabung({ nim: "n3", nama: "x", kelompok: null })).toEqual({ ok: true });
    expect(host(r).jumlahPemain).toBe(120);
  });

  it("ranks by score, then right answers, then speed, and reports rank moves", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.gabung({ nim: "2", nama: "Budi", kelompok: null });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    jam.maju(2_000);
    r.jawab("2", 1);
    jam.maju(2_000);
    r.jawab("1", 1);
    const p = host(r).papan;
    expect(p.map((b) => b.nim)).toEqual(["2", "1"]);
    expect(p[0].naik).toBe(1); // Budi started second (tie, by nim) and is now first
    expect(p[1].naik).toBe(-1);
  });

  it("averages the score per group", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "A", kelompok: 3 });
    r.gabung({ nim: "2", nama: "B", kelompok: 3 });
    r.gabung({ nim: "3", nama: "C", kelompok: 5 });
    r.gabung({ nim: "4", nama: "D", kelompok: null });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    r.jawab("1", 1);
    r.jawab("2", 0);
    r.jawab("3", 1);
    r.jawab("4", 1);
    const g = host(r).kelompok;
    expect(g.map((x) => x.kelompok)).toEqual([5, 3]);
    expect(g.find((x) => x.kelompok === 3)).toMatchObject({ jumlah: 2 });
  });
});

describe("what a player may see", () => {
  it("never holds the right answer or the spread while the question is open", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.gabung({ nim: "2", nama: "Budi", kelompok: null });
    r.atur({ acak: false });
    r.mulai();
    for (const f of ["hitung", "soal"]) {
      const json = JSON.stringify(pemain(r, "1"));
      expect(json).not.toContain("benarIndeks");
      expect(json).not.toContain("Jawab 1");
      expect(json).not.toContain('"benar"');
      expect(pemain(r, "1").hasil).toBeNull();
      jam.maju(MS_HITUNG);
      r.tick();
      expect(f).toBeTruthy();
    }
    r.jawab("1", 0);
    const mid = pemain(r, "1");
    expect(mid.pilih).toBe(0);
    expect(JSON.stringify(mid)).not.toContain("benarIndeks");
    expect(mid.hasil).toBeNull();
  });

  it("shows the answer from the reveal on, in the viewer's own language", () => {
    const { r, jam } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    r.jawab("1", 0);
    expect(r.faseSaatIni).toBe("buka");
    const id = pemain(r, "1", "id");
    const en = pemain(r, "1", "en");
    expect(id.hasil).toMatchObject({ benar: false, benarIndeks: 1, penjelasan: "Jawab 1" });
    expect(en.hasil?.penjelasan).toBe("Answer 1");
    expect(id.soal?.teks).toBe("Soal 1");
    expect(en.soal?.teks).toBe("Question 1");
    expect(host(r).buka?.sebaran).toEqual([1, 0, 0, 0]);
  });

  it("keeps the real question bank free of answers in a player's view", () => {
    const r = new RuangKuis({ sesiId: 1, soal: SOAL_MODUL4, now: () => 5 });
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    r.mulai();
    const v = pemain(r, "1");
    expect(Object.keys(v.soal ?? {}).sort()).toEqual(["id", "nomor", "pilihan", "teks", "tipe"]);
  });

  it("gives a player the top 5 only on the leaderboard and the podium", () => {
    const { r, jam } = dasar();
    for (let i = 0; i < 8; i++) r.gabung({ nim: `n${i}`, nama: `P${i}`, kelompok: null });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    expect(pemain(r, "n0").papan).toEqual([]);
    for (let i = 0; i < 8; i++) r.jawab(`n${i}`, 1);
    r.lanjut();
    expect(r.faseSaatIni).toBe("papan");
    expect(pemain(r, "n7").papan).toHaveLength(5);
    expect(pemain(r, "n7").saya?.peringkat).toBe(8);
  });
});

describe("deck", () => {
  it("filters by Tipe, caps the count and shuffles only when asked", () => {
    const rng = () => 0.5;
    const semua = bangunDek(
      SOAL_MODUL4,
      { ...PENGATURAN_AWAL, sumber: "semua", jumlah: 25, acak: false },
      rng,
    );
    expect(semua.map((s) => s.id)).toEqual(SOAL_MODUL4.map((s) => s.id));
    const tipeC = bangunDek(
      SOAL_MODUL4,
      { ...PENGATURAN_AWAL, sumber: "C", jumlah: 25, acak: true },
      rng,
    );
    expect(tipeC).toHaveLength(5);
    expect(tipeC.every((s) => s.tipe === "C")).toBe(true);
    expect(bangunDek(SOAL_MODUL4, { ...PENGATURAN_AWAL, jumlah: 7, acak: true }, rng)).toHaveLength(
      7,
    );
  });
});

describe("save and restore", () => {
  it("brings the room back paused with everyone offline", () => {
    const { r, jam, bank } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: 2 });
    r.atur({ acak: false });
    mainkanSampaiSoal(r, jam);
    r.jawab("1", 1);
    const simpanan = JSON.parse(JSON.stringify(r.simpan()));
    const baru = RuangKuis.pulihkan(simpanan, { soal: bank, now: jam.now });
    expect(baru).not.toBeNull();
    expect(baru!.faseSaatIni).toBe("buka");
    expect(host(baru!).jumlahOnline).toBe(0);
    expect(host(baru!).papan[0]).toMatchObject({ nim: "1", skor: expect.any(Number) });
    expect(baru!.gabung({ nim: "1", nama: "Ani", kelompok: 2 })).toEqual({ ok: true });
  });

  it("restores a timed phase paused, and refuses a save it cannot read", () => {
    const { r, jam, bank } = dasar();
    r.gabung({ nim: "1", nama: "Ani", kelompok: null });
    mainkanSampaiSoal(r, jam);
    const baru = RuangKuis.pulihkan(JSON.parse(JSON.stringify(r.simpan())), {
      soal: bank,
      now: jam.now,
    })!;
    expect(host(baru).dijeda).toBe(true);
    jam.maju(60_000);
    expect(baru.tick()).toBe(false);
    expect(RuangKuis.pulihkan({ v: 2 } as never, { soal: bank })).toBeNull();
    const rusak = JSON.parse(JSON.stringify(r.simpan()));
    rusak.dek = ["tidak-ada"];
    expect(RuangKuis.pulihkan(rusak, { soal: bank })).toBeNull();
  });
});
