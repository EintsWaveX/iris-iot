/**
 * The Kuis game engine: one room, one game at a time, no I/O.
 *
 * The server (server/kuis.ts) owns a RuangKuis per running Module 4 session,
 * calls `tick()` on a timer and after every action, and sends each socket the
 * view from `lihat()`. All times come from the injected `now()` (the server's
 * clock is the only one that counts), and the shuffle comes from the injected
 * `acak()`, so the whole game can be replayed in a test.
 *
 * Phases: lobi -> hitung (3-2-1) -> soal (answering) -> buka (reveal) -> papan
 * (leaderboard) -> hitung ... -> podium. The host moves buka and papan on with
 * `lanjut()`; hitung and soal end by themselves.
 *
 * What a player may learn is decided in `lihat()` alone: the right answer and
 * the spread of answers only exist in a player's view once the phase is buka
 * or later, so a player's socket never holds them while a question is open.
 */
import type { BahasaKonten } from "../kelas.js";
import {
  BATAS_DETIK,
  BONUS_STREAK,
  BONUS_STREAK_MAKS,
  MAKS_PEMAIN,
  PENGATURAN_AWAL,
  POIN_MAKS,
  type Fase,
  type PengaturanKuis,
  type SoalKuis,
  type SoalPublik,
  TIPE_SOAL,
} from "./types.js";

export const MS_HITUNG = 3000;

export interface OpsiRuang {
  sesiId: number;
  soal: readonly SoalKuis[];
  now?: () => number;
  /** A random number in [0, 1), for the shuffle. */
  acak?: () => number;
}

export interface Pemain {
  nim: string;
  nama: string;
  kelompok: number | null;
  skor: number;
  streak: number;
  benar: number;
  /** Total answer time of the right answers, to break ties by speed. */
  msBenar: number;
  online: boolean;
}

interface JawabanSoal {
  pilih: number;
  ms: number;
  benar: boolean;
  poin: number;
  bonus: number;
}

export type Hasil = { ok: true } | { ok: false; galat: Galat };
export type Galat =
  | "penuh"
  | "bukan-lobi"
  | "tanpa-pemain"
  | "fase-salah"
  | "sudah-jawab"
  | "terlambat"
  | "pilihan-salah"
  | "bukan-pemain"
  | "dijeda"
  | "pengaturan-salah";

const ok: Hasil = { ok: true };
const gagal = (galat: Galat): Hasil => ({ ok: false, galat });

/** One line of the leaderboard. */
export interface BarisPapan {
  nim: string;
  nama: string;
  kelompok: number | null;
  skor: number;
  peringkat: number;
  /** Places moved up (+) or down (-) during the question just played. */
  naik: number;
  streak: number;
  online: boolean;
}

export interface BarisKelompok {
  kelompok: number;
  rata: number;
  jumlah: number;
}

/** What every view has. */
interface DasarLihat {
  fase: Fase;
  /** The server's clock when this view was made, for the client's offset. */
  waktu: number;
  /** When the current timed phase ends (server clock), or null. */
  akhir: number | null;
  dijeda: boolean;
  /** While paused: the time (ms) left on the clock, which stands still. */
  sisa: number | null;
  /** 1-based question number and the size of the deck. */
  nomor: number;
  total: number;
  detik: number;
  jumlahPemain: number;
  jumlahOnline: number;
}

export interface Pembukaan {
  benar: number;
  penjelasan: string;
  /** How many picked each option, and how many did not answer. */
  sebaran: number[];
  kosong: number;
}

export interface LihatHost extends DasarLihat {
  peran: "host";
  /** How many have answered the open question (players do not get this, so a phone is not resent on every answer). */
  terjawab: number;
  pengaturan: PengaturanKuis;
  soal: SoalPublik | null;
  buka: Pembukaan | null;
  pemain: { nim: string; nama: string; kelompok: number | null; online: boolean }[];
  papan: BarisPapan[];
  kelompok: BarisKelompok[];
}

export interface LihatPemain extends DasarLihat {
  peran: "pemain";
  soal: SoalPublik | null;
  /** The option this player picked for the open question, or null. */
  pilih: number | null;
  /** Filled from the reveal on. */
  hasil: {
    benar: boolean;
    pilih: number | null;
    poin: number;
    bonus: number;
    benarIndeks: number;
    penjelasan: string;
  } | null;
  saya: BarisPapan | null;
  papan: BarisPapan[];
  kelompok: BarisKelompok[];
}

export type Lihat = LihatHost | LihatPemain;

export interface Simpanan {
  v: 1;
  sesiId: number;
  fase: Fase;
  pengaturan: PengaturanKuis;
  dek: string[];
  indeks: number;
  pemain: Pemain[];
  jawaban: Record<string, JawabanSoal>;
  rankAwal: Record<string, number>;
}

function terbatas(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export class RuangKuis {
  readonly sesiId: number;
  private readonly bank: readonly SoalKuis[];
  private readonly now: () => number;
  private readonly acak: () => number;

  private fase: Fase = "lobi";
  private pengaturan: PengaturanKuis = { ...PENGATURAN_AWAL };
  private dek: SoalKuis[] = [];
  private indeks = -1;
  private pemain = new Map<string, Pemain>();
  private jawaban = new Map<string, JawabanSoal>();
  private rankAwal = new Map<string, number>();
  private mulaiSoal = 0;
  private akhirFase: number | null = null;
  private sisaJeda: number | null = null;
  private dijeda = false;

  constructor(opsi: OpsiRuang) {
    this.sesiId = opsi.sesiId;
    this.bank = opsi.soal;
    this.now = opsi.now ?? Date.now;
    this.acak = opsi.acak ?? Math.random;
  }

  // ---------- who is in the room ----------

  gabung(p: { nim: string; nama: string; kelompok: number | null }): Hasil {
    const ada = this.pemain.get(p.nim);
    if (ada) {
      ada.online = true;
      ada.nama = p.nama;
      ada.kelompok = p.kelompok;
      return ok;
    }
    if (this.pemain.size >= MAKS_PEMAIN) return gagal("penuh");
    this.pemain.set(p.nim, {
      nim: p.nim,
      nama: p.nama,
      kelompok: p.kelompok,
      skor: 0,
      streak: 0,
      benar: 0,
      msBenar: 0,
      online: true,
    });
    return ok;
  }

  /** The socket closed. The player keeps their score and can come back. */
  putus(nim: string): void {
    const p = this.pemain.get(nim);
    if (p) p.online = false;
  }

  tendang(nim: string): Hasil {
    if (!this.pemain.delete(nim)) return gagal("bukan-pemain");
    this.jawaban.delete(nim);
    this.rankAwal.delete(nim);
    return ok;
  }

  punyaPemain(nim: string): boolean {
    return this.pemain.has(nim);
  }

  get faseSaatIni(): Fase {
    return this.fase;
  }

  // ---------- host actions ----------

  atur(p: Partial<PengaturanKuis>): Hasil {
    if (this.fase !== "lobi") return gagal("bukan-lobi");
    const baru = { ...this.pengaturan, ...p };
    if (baru.sumber !== "semua" && !(TIPE_SOAL as readonly string[]).includes(baru.sumber)) {
      return gagal("pengaturan-salah");
    }
    if (
      typeof baru.acak !== "boolean" ||
      !Number.isFinite(baru.jumlah) ||
      !Number.isFinite(baru.detik)
    ) {
      return gagal("pengaturan-salah");
    }
    baru.detik = terbatas(baru.detik, BATAS_DETIK.min, BATAS_DETIK.max);
    baru.jumlah = terbatas(baru.jumlah, 1, this.bank.length);
    this.pengaturan = baru;
    return ok;
  }

  mulai(): Hasil {
    if (this.fase !== "lobi") return gagal("bukan-lobi");
    if (![...this.pemain.values()].some((p) => p.online)) return gagal("tanpa-pemain");
    this.dek = bangunDek(this.bank, this.pengaturan, this.acak);
    this.indeks = -1;
    for (const p of this.pemain.values())
      Object.assign(p, { skor: 0, streak: 0, benar: 0, msBenar: 0 });
    this.mulaiSoalBerikut();
    return ok;
  }

  /** Reveal -> leaderboard -> next question; during a question, skip to the reveal. */
  lanjut(): Hasil {
    if (this.dijeda) return gagal("dijeda");
    switch (this.fase) {
      case "hitung":
        this.bukaSoal();
        return ok;
      case "soal":
        this.tutupSoal();
        return ok;
      case "buka":
        if (this.indeks >= this.dek.length - 1) this.keAkhir();
        else this.fase = "papan";
        return ok;
      case "papan":
        this.mulaiSoalBerikut();
        return ok;
      default:
        return gagal("fase-salah");
    }
  }

  jeda(): Hasil {
    if (this.dijeda) return ok;
    if (this.fase !== "hitung" && this.fase !== "soal") return gagal("fase-salah");
    this.dijeda = true;
    this.sisaJeda = Math.max(0, (this.akhirFase ?? this.now()) - this.now());
    this.akhirFase = null;
    return ok;
  }

  teruskan(): Hasil {
    if (!this.dijeda) return ok;
    this.dijeda = false;
    this.akhirFase = this.now() + (this.sisaJeda ?? 0);
    this.sisaJeda = null;
    return ok;
  }

  akhiri(): Hasil {
    if (this.fase === "lobi" || this.fase === "podium") return gagal("fase-salah");
    this.dijeda = false;
    this.keAkhir();
    return ok;
  }

  /** Back to the lobby with the same players, scores cleared. */
  mainLagi(): Hasil {
    if (this.fase !== "podium") return gagal("fase-salah");
    this.fase = "lobi";
    this.dek = [];
    this.indeks = -1;
    this.jawaban.clear();
    this.rankAwal.clear();
    this.akhirFase = null;
    for (const p of this.pemain.values())
      Object.assign(p, { skor: 0, streak: 0, benar: 0, msBenar: 0 });
    return ok;
  }

  // ---------- player action ----------

  jawab(nim: string, pilih: unknown): Hasil {
    const p = this.pemain.get(nim);
    if (!p) return gagal("bukan-pemain");
    if (this.fase !== "soal") return gagal("fase-salah");
    if (this.dijeda) return gagal("dijeda");
    const soal = this.dek[this.indeks];
    if (
      typeof pilih !== "number" ||
      !Number.isInteger(pilih) ||
      pilih < 0 ||
      pilih >= soal.pilihan.id.length
    ) {
      return gagal("pilihan-salah");
    }
    if (this.jawaban.has(nim)) return gagal("sudah-jawab");
    const t = this.now();
    if (this.akhirFase !== null && t > this.akhirFase) return gagal("terlambat");
    const ms = Math.max(0, t - this.mulaiSoal);
    const benar = pilih === soal.benar;
    let poin = 0;
    let bonus = 0;
    if (benar) {
      poin = hitungPoin(ms, this.pengaturan.detik * 1000);
      p.streak += 1;
      bonus = Math.min(BONUS_STREAK_MAKS, (p.streak - 1) * BONUS_STREAK);
      p.skor += poin + bonus;
      p.benar += 1;
      p.msBenar += ms;
    } else {
      p.streak = 0;
    }
    this.jawaban.set(nim, { pilih, ms, benar, poin, bonus });
    // Everyone who is here has answered: do not make the room wait for the clock.
    if (this.semuaMenjawab()) this.tutupSoal();
    return ok;
  }

  // ---------- the clock ----------

  /** Moves timed phases on. Returns true when the phase changed. */
  tick(): boolean {
    if (this.dijeda || this.akhirFase === null) return false;
    if (this.now() < this.akhirFase) return false;
    if (this.fase === "hitung") {
      this.bukaSoal();
      return true;
    }
    if (this.fase === "soal") {
      this.tutupSoal();
      return true;
    }
    return false;
  }

  // ---------- views ----------

  lihat(nim: string | null, peran: "host" | "pemain", bahasa: BahasaKonten): Lihat {
    const soal = this.dek[this.indeks] ?? null;
    const dasar: DasarLihat = {
      fase: this.fase,
      waktu: this.now(),
      akhir: this.akhirFase,
      dijeda: this.dijeda,
      sisa: this.dijeda ? this.sisaJeda : null,
      nomor: Math.max(0, this.indeks + 1),
      total: this.dek.length || this.pengaturan.jumlah,
      detik: this.pengaturan.detik,
      jumlahPemain: this.pemain.size,
      jumlahOnline: [...this.pemain.values()].filter((p) => p.online).length,
    };
    const tampilSoal =
      soal &&
      (this.fase === "soal" ||
        this.fase === "buka" ||
        this.fase === "papan" ||
        this.fase === "hitung")
        ? publik(soal, bahasa)
        : null;
    const sudahBuka = this.fase === "buka" || this.fase === "papan";
    const papan = this.papan();
    const kelompok = this.papanKelompok();

    if (peran === "host") {
      return {
        ...dasar,
        peran: "host",
        terjawab: this.jawaban.size,
        pengaturan: { ...this.pengaturan },
        soal: tampilSoal,
        buka: soal && sudahBuka ? this.pembukaan(soal, bahasa) : null,
        pemain: [...this.pemain.values()].map((p) => ({
          nim: p.nim,
          nama: p.nama,
          kelompok: p.kelompok,
          online: p.online,
        })),
        papan,
        kelompok,
      };
    }

    const saya = nim ? (papan.find((b) => b.nim === nim) ?? null) : null;
    const jawabanSaya = nim ? this.jawaban.get(nim) : undefined;
    return {
      ...dasar,
      peran: "pemain",
      soal: tampilSoal,
      pilih: this.fase === "soal" ? (jawabanSaya?.pilih ?? null) : null,
      hasil:
        soal && sudahBuka
          ? {
              benar: jawabanSaya?.benar ?? false,
              pilih: jawabanSaya?.pilih ?? null,
              poin: jawabanSaya?.poin ?? 0,
              bonus: jawabanSaya?.bonus ?? 0,
              benarIndeks: soal.benar,
              penjelasan: soal.penjelasan[bahasa],
            }
          : null,
      saya,
      papan: this.fase === "papan" || this.fase === "podium" ? papan.slice(0, 5) : [],
      kelompok: this.fase === "papan" || this.fase === "podium" ? kelompok : [],
    };
  }

  /** The final standings, for saving. */
  hasilAkhir(): {
    nim: string;
    nama: string;
    kelompok: number | null;
    skor: number;
    benar: number;
    peringkat: number;
  }[] {
    return this.papan().map((b) => ({
      nim: b.nim,
      nama: b.nama,
      kelompok: b.kelompok,
      skor: b.skor,
      benar: this.pemain.get(b.nim)?.benar ?? 0,
      peringkat: b.peringkat,
    }));
  }

  // ---------- saving and restoring ----------

  simpan(): Simpanan {
    return {
      v: 1,
      sesiId: this.sesiId,
      fase: this.fase,
      pengaturan: { ...this.pengaturan },
      dek: this.dek.map((s) => s.id),
      indeks: this.indeks,
      pemain: [...this.pemain.values()].map((p) => ({ ...p })),
      jawaban: Object.fromEntries(this.jawaban),
      rankAwal: Object.fromEntries(this.rankAwal),
    };
  }

  /**
   * Brings a saved room back after a restart. Everyone starts offline and a
   * timed phase comes back paused, so the host decides when to go on.
   */
  static pulihkan(s: Simpanan, opsi: Omit<OpsiRuang, "sesiId">): RuangKuis | null {
    if (s?.v !== 1 || !Array.isArray(s.dek) || !Array.isArray(s.pemain)) return null;
    const r = new RuangKuis({ ...opsi, sesiId: s.sesiId });
    const peta = new Map(opsi.soal.map((q) => [q.id, q]));
    const dek: SoalKuis[] = [];
    for (const id of s.dek) {
      const q = peta.get(id);
      if (!q) return null;
      dek.push(q);
    }
    r.fase = s.fase;
    r.pengaturan = { ...PENGATURAN_AWAL, ...s.pengaturan };
    r.dek = dek;
    r.indeks = s.indeks;
    for (const p of s.pemain) r.pemain.set(p.nim, { ...p, online: false });
    r.jawaban = new Map(Object.entries(s.jawaban ?? {}));
    r.rankAwal = new Map(Object.entries(s.rankAwal ?? {}));
    if (s.fase === "hitung" || s.fase === "soal") {
      r.dijeda = true;
      r.sisaJeda = s.fase === "hitung" ? MS_HITUNG : r.pengaturan.detik * 1000;
      r.mulaiSoal = r.now();
    }
    return r;
  }

  // ---------- internals ----------

  private mulaiSoalBerikut(): void {
    this.indeks += 1;
    if (this.indeks >= this.dek.length) return this.keAkhir();
    this.jawaban.clear();
    this.rankAwal = new Map(this.papan().map((b) => [b.nim, b.peringkat]));
    this.fase = "hitung";
    this.akhirFase = this.now() + MS_HITUNG;
  }

  private bukaSoal(): void {
    this.fase = "soal";
    this.mulaiSoal = this.now();
    this.akhirFase = this.mulaiSoal + this.pengaturan.detik * 1000;
  }

  private tutupSoal(): void {
    // Whoever did not answer loses their streak.
    for (const p of this.pemain.values()) if (!this.jawaban.has(p.nim)) p.streak = 0;
    this.fase = "buka";
    this.akhirFase = null;
  }

  private keAkhir(): void {
    this.fase = "podium";
    this.akhirFase = null;
  }

  private semuaMenjawab(): boolean {
    const online = [...this.pemain.values()].filter((p) => p.online);
    return online.length > 0 && online.every((p) => this.jawaban.has(p.nim));
  }

  private pembukaan(soal: SoalKuis, bahasa: BahasaKonten): Pembukaan {
    const sebaran = soal.pilihan.id.map(() => 0);
    for (const j of this.jawaban.values()) sebaran[j.pilih] += 1;
    return {
      benar: soal.benar,
      penjelasan: soal.penjelasan[bahasa],
      sebaran,
      kosong: Math.max(0, this.pemain.size - this.jawaban.size),
    };
  }

  private papan(): BarisPapan[] {
    const urut = [...this.pemain.values()].sort(
      (a, b) =>
        b.skor - a.skor || b.benar - a.benar || a.msBenar - b.msBenar || a.nim.localeCompare(b.nim),
    );
    return urut.map((p, i) => {
      const sebelum = this.rankAwal.get(p.nim);
      return {
        nim: p.nim,
        nama: p.nama,
        kelompok: p.kelompok,
        skor: p.skor,
        peringkat: i + 1,
        naik: sebelum === undefined ? 0 : sebelum - (i + 1),
        streak: p.streak,
        online: p.online,
      };
    });
  }

  private papanKelompok(): BarisKelompok[] {
    const peta = new Map<number, { jumlah: number; skor: number }>();
    for (const p of this.pemain.values()) {
      if (p.kelompok === null) continue;
      const g = peta.get(p.kelompok) ?? { jumlah: 0, skor: 0 };
      g.jumlah += 1;
      g.skor += p.skor;
      peta.set(p.kelompok, g);
    }
    return [...peta.entries()]
      .map(([kelompok, g]) => ({ kelompok, jumlah: g.jumlah, rata: Math.round(g.skor / g.jumlah) }))
      .sort((a, b) => b.rata - a.rata || a.kelompok - b.kelompok);
  }
}

/** Kahoot's speed score: full points at once, half points at the last moment. */
export function hitungPoin(ms: number, batasMs: number): number {
  const bagian = Math.min(1, Math.max(0, ms / batasMs));
  return Math.round(POIN_MAKS * (1 - bagian / 2));
}

export function publik(s: SoalKuis, bahasa: BahasaKonten): SoalPublik {
  return {
    id: s.id,
    tipe: s.tipe,
    nomor: s.nomor,
    teks: s.teks[bahasa],
    pilihan: s.pilihan[bahasa],
  };
}

/** The questions a game will play, in order. */
export function bangunDek(
  bank: readonly SoalKuis[],
  p: PengaturanKuis,
  acak: () => number,
): SoalKuis[] {
  const sumber = p.sumber === "semua" ? [...bank] : bank.filter((s) => s.tipe === p.sumber);
  if (p.acak) {
    for (let i = sumber.length - 1; i > 0; i--) {
      const j = Math.floor(acak() * (i + 1));
      [sumber[i], sumber[j]] = [sumber[j], sumber[i]];
    }
  }
  return sumber.slice(0, Math.max(1, Math.min(p.jumlah, sumber.length)));
}
