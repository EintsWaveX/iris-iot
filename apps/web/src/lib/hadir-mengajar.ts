/**
 * The teaching-attendance rule. The clock starts five minutes before the slot
 * (Friday slot 3 at 13:00): a check-in in the first minute is on time, 1 to 10
 * minutes late is cut per minute, 11 or more is Mangkir Mengajar (counted as 10
 * minutes), and never checking in is Mangkir; Izin is never cut.
 * Browser safe: pure functions, no database, no clock of its own.
 */
import { SESI_CAP_MENIT, SESI_MIN_MENIT, SLOT_MULAI } from "./jadwal.js";
import { hariDariTanggal } from "./jadwal-parser.js";
import { jamDariMenit, menitDariJam } from "./sesi-mulai.js";

/** Minutes counted for a Mangkir Mengajar check-in and the latest a Telat can be. */
export const TELAT_MAKS = 10;

/**
 * The first date judged (WIB): the deploy date, the first practicum Monday.
 * Older sessions have no check-in trail, so nobody in them is Telat or
 * Mangkir, nothing is cut and no Lupa Input Nilai is recorded. The deploy
 * checklist sets it to the deploy date if the deploy is later.
 */
export const HADIR_SEJAK = "2026-10-19";

/** Whether a session or slot on this date ("YYYY-MM-DD") is judged at all. */
export const dinilai = (tanggal: string) => tanggal >= HADIR_SEJAK;

export type Potongan = { perMenit: number; maks: number };
export const POTONGAN_AWAL: Potongan = { perMenit: 2000, maks: 10 };

export type StatusHadir = "tepat" | "telat" | "mm" | "mangkir" | "izin";
/** `lepas` = not expected in this session, never judged. */
export type StatusLive = StatusHadir | "belum" | "berjalan" | "lewat" | "lepas";

/** Reads one `potongan_telat` entry; each field falls back on its own. A rate of 0 switches the cut off. */
export function bacaPotongan(v: unknown): Potongan {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const rate = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  // The cap is whole minutes: floor first, then check it is still above zero.
  // A Telat is at most TELAT_MAKS minutes, so a larger stored cap reads as that.
  const maks = typeof o.maks === "number" ? Math.floor(o.maks) : NaN;
  return {
    perMenit: rate(o.perMenit) ? o.perMenit : POTONGAN_AWAL.perMenit,
    maks: maks > 0 && Number.isFinite(maks) ? Math.min(maks, TELAT_MAKS) : POTONGAN_AWAL.maks,
  };
}

export type RiwayatPotongan = Potongan & { berlakuMulai: string };
const TANGGAL_POTONGAN = /^\d{4}-\d{2}-\d{2}$/;
/** "In force from the start" for a value saved before the history existed. */
export const POTONGAN_DARI_AWAL = "0000-01-01";

/** The rate history in `potongan_telat`, oldest first; an old value is one entry from the start. */
export function bacaRiwayatPotongan(v: unknown): RiwayatPotongan[] {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lst = Array.isArray(o.riwayat) ? o.riwayat : [];
  const rows = lst
    .filter(
      (x): x is Record<string, unknown> =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Record<string, unknown>).berlakuMulai === "string" &&
        TANGGAL_POTONGAN.test((x as Record<string, string>).berlakuMulai),
    )
    .map((x) => ({ berlakuMulai: x.berlakuMulai as string, ...bacaPotongan(x) }))
    .sort((a, b) =>
      a.berlakuMulai < b.berlakuMulai ? -1 : a.berlakuMulai > b.berlakuMulai ? 1 : 0,
    );
  return rows.length ? rows : [{ berlakuMulai: POTONGAN_DARI_AWAL, ...bacaPotongan(v) }];
}

/** The rate in force on a date (the last entry that started on or before it); the newest with no date. */
export function potonganPada(v: unknown, tanggal?: string): Potongan {
  const r = bacaRiwayatPotongan(v);
  const pilih = tanggal ? r.filter((x) => x.berlakuMulai <= tanggal).at(-1) : r.at(-1);
  const { perMenit, maks } = pilih ?? r[0];
  return { perMenit, maks };
}

/** The value to save when the rate changes on `tanggal`: a same-day entry is replaced. */
export function riwayatBaru(v: unknown, tanggal: string, p: Potongan) {
  const lama = bacaRiwayatPotongan(v).filter((x) => x.berlakuMulai !== tanggal);
  return { ...p, riwayat: [...lama, { berlakuMulai: tanggal, ...p }] };
}

/** Base clock of a slot in minutes after 00:00: the start minus 5, Friday slot 3 at 13:00. */
export function baseSlot(tanggal: string, slot: number): number {
  if (hariDariTanggal(tanggal) === 5 && slot === 3) return 13 * 60;
  return menitDariJam(SLOT_MULAI[slot]) - 5;
}

/** Base clock of a susulan session: its own start minus 5. */
export function baseSusulan(mulai: string): number {
  return menitDariJam(mulai) - 5;
}

/** A WIB wall-clock minute on a date, as an instant (WIB is UTC+7, no DST). */
export function instanWib(tanggal: string, menit: number): Date {
  return new Date(`${tanggal}T${jamDariMenit(Math.max(0, menit))}:00+07:00`);
}

type Ubah = { status: StatusHadir; menit?: number | null };

/** Status of one Asisten in one session; a PJ override wins over the clock. */
export function hitungHadir(x: {
  hadir: Date | null;
  base: Date;
  izin: boolean;
  diharapkan: boolean;
  selesai: boolean;
  now: Date;
  ubah?: Ubah | null;
}): { status: StatusLive; menit: number | null } {
  if (x.izin) return { status: "izin", menit: null };
  if (!x.diharapkan) return { status: "lepas", menit: null };
  if (x.ubah) {
    const s = x.ubah.status;
    const menit = s === "telat" ? (x.ubah.menit ?? null) : s === "mm" ? TELAT_MAKS : null;
    return { status: s, menit };
  }
  const menitDari = (t: Date) => Math.floor((t.getTime() - x.base.getTime()) / 60000);
  if (x.hadir) {
    const m = menitDari(x.hadir);
    if (m < 1) return { status: "tepat", menit: null };
    if (m <= TELAT_MAKS) return { status: "telat", menit: m };
    return { status: "mm", menit: TELAT_MAKS };
  }
  if (x.selesai) return { status: "mangkir", menit: null };
  const m = menitDari(x.now);
  if (m < 1) return { status: "belum", menit: null };
  if (m <= TELAT_MAKS) return { status: "berjalan", menit: m };
  return { status: "lewat", menit: TELAT_MAKS };
}

/** What a status costs: a money cut, or all of the session's units set to zero. */
export function potonganHadir(
  h: { status: StatusLive; menit: number | null },
  hitungMangkir: boolean,
  p: Potongan,
): { nolkanUnit: boolean; potong: number } {
  if (h.status === "mangkir") return { nolkanUnit: true, potong: 0 };
  if (h.status === "mm") {
    return hitungMangkir
      ? { nolkanUnit: true, potong: 0 }
      : { nolkanUnit: false, potong: p.maks * p.perMenit };
  }
  if (h.status === "telat") {
    const m = Math.min(h.menit ?? 0, p.maks);
    return { nolkanUnit: false, potong: m * p.perMenit };
  }
  return { nolkanUnit: false, potong: 0 };
}

/** Minutes a session may run: until the next slot's base that day, at most 150, at least 30. */
export function akhirSesiMaks(tanggal: string, slot: number | null, mulaiPada: Date): number {
  if (slot === null || slot >= 4) return SESI_CAP_MENIT;
  const berikut = instanWib(tanggal, baseSlot(tanggal, slot + 1));
  const sisa = Math.floor((berikut.getTime() - mulaiPada.getTime()) / 60000);
  return Math.max(SESI_MIN_MENIT, Math.min(SESI_CAP_MENIT, sisa));
}

/* --------------------------------------------------------------- reports */

/** One person's counts over a set of sessions (Laporan, Tim, Akun). */
export interface RingkasOrang {
  tepat: number;
  telat: number;
  mm: number;
  mangkir: number;
  izin: number;
  /** Money cut for Telat and for an uncounted Mangkir Mengajar. */
  potong: number;
  /** Sessions whose units were set to zero (Mangkir, or a counted Mangkir Mengajar). */
  sesiNol: number;
}

export const RINGKAS_KOSONG: Readonly<RingkasOrang> = {
  tepat: 0,
  telat: 0,
  mm: 0,
  mangkir: 0,
  izin: 0,
  potong: 0,
  sesiNol: 0,
};

/** The fields that carry someone's Rp cut: the money, and a zeroed session. */
const KUNCI_RP = ["potong", "nolkanUnit", "sesiNol"] as const;
type KunciRp = (typeof KUNCI_RP)[number];

/**
 * Rows as someone sees them: their own row keeps its Rp cut, everyone
 * else's loses it unless `semua` (the hadir or tim right: ADS and Admins).
 * Statuses and minutes stay for everyone.
 */
export function saringRp<T extends { nim: string }>(
  rows: readonly T[],
  saya: string | null,
  semua: boolean,
): (T | Omit<T, KunciRp>)[] {
  if (semua) return [...rows];
  return rows.map((r) => (r.nim === saya ? r : tanpaRp(r)));
}

/** One row without its Rp cut. */
export function tanpaRp<T extends object>(r: T): Omit<T, KunciRp> {
  const out = { ...r } as Record<string, unknown>;
  for (const k of KUNCI_RP) delete out[k];
  return out as Omit<T, KunciRp>;
}

/** Counts statuses per person; `lepas` (not expected) and the still-running states count nothing. */
export function ringkasHadir(
  baris: { nim: string; status: StatusLive; potong: number; nolkanUnit: boolean }[],
): Map<string, RingkasOrang> {
  const out = new Map<string, RingkasOrang>();
  for (const b of baris) {
    const r = out.get(b.nim) ?? { ...RINGKAS_KOSONG };
    out.set(b.nim, r);
    if (
      b.status === "tepat" ||
      b.status === "telat" ||
      b.status === "mm" ||
      b.status === "mangkir" ||
      b.status === "izin"
    ) {
      r[b.status] += 1;
      r.potong += b.potong;
      if (b.nolkanUnit) r.sesiNol += 1;
    }
  }
  return out;
}

type LangHadir = "id" | "en" | "zh";

export interface TeksHadirOrang {
  kode: string;
  status: StatusLive;
  menit: number | null;
  /** Check-in time, "HH:MM", or null when they never checked in. */
  jam: string | null;
  /** Absent when the reader may not see this person's Rp cut. */
  potong?: number;
  /** Whether a Mangkir Mengajar counts as Mangkir (the PJ's switch); on when absent. */
  hitungMangkir?: boolean;
  /** Groups of this person that someone else took over, and when. */
  ambilAlih?: { kode: string; nomor: number | null; jam: string }[];
  /** A PJ's change of this status, with the reason. */
  ubah?: { oleh: string; alasan: string } | null;
}

export interface TeksHadirMasukan {
  lang: LangHadir;
  /** The long date, the session, module and class, already in the page language. */
  tanggal: string;
  sesi: string;
  modul: string;
  kelas: string;
  /** "12:25" when IRIS started the session by itself. */
  mulaiOtomatis: string | null;
  geser: { dari: string; ke: string; alasan: string } | null;
  orang: TeksHadirOrang[];
  /** Each group's score input; null leaves the sentence out (the session is not over). */
  nilai: { nomor: number; lupa: boolean; menyusul: string | null }[] | null;
}

/**
 * The sentence's score rows from a session's Input Nilai rows: a group still
 * open (its deadline not passed) is left out, as it is neither done nor
 * recorded as Lupa Input Nilai.
 */
export function nilaiUntukTeks(
  rows: {
    nomor: number;
    status: "tepat" | "menyusul" | "lupa" | "terbuka";
    menyusulPada: string | null;
  }[],
  waktu: (iso: string) => string,
): NonNullable<TeksHadirMasukan["nilai"]> {
  return rows
    .filter((n) => n.status !== "terbuka")
    .map((n) => ({
      nomor: n.nomor,
      lupa: n.status === "lupa" || n.status === "menyusul",
      menyusul: n.menyusulPada ? waktu(n.menyusulPada) : null,
    }));
}

/** "1 to 3", "4 and 5", "1, 3 and 5": numbers for a sentence, a run of three or more folded. */
export function daftarNomor(nomor: number[], lang: LangHadir): string {
  const urut = [...new Set(nomor)].sort((a, b) => a - b);
  const sampai = { id: " sampai ", en: " to ", zh: "至" }[lang];
  const dan = { id: " dan ", en: " and ", zh: "和" }[lang];
  const koma = lang === "zh" ? "、" : ", ";
  const bagian: string[] = [];
  for (let i = 0; i < urut.length;) {
    let j = i;
    while (j + 1 < urut.length && urut[j + 1] === urut[j] + 1) j++;
    if (j - i >= 2) {
      bagian.push(`${urut[i]}${sampai}${urut[j]}`);
      i = j + 1;
    } else {
      bagian.push(String(urut[i]));
      i++;
    }
  }
  if (bagian.length <= 1) return bagian.join("");
  return bagian.slice(0, -1).join(koma) + dan + bagian[bagian.length - 1];
}

const rpTeks = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** One person's sentence, without its full stop. */
function kalimatOrang(o: TeksHadirOrang, lang: LangHadir): string {
  const jam = o.jam ? ` ${o.jam}` : "";
  const lama = o.menit ?? 0;
  let s: string;
  switch (o.status) {
    case "tepat":
      s = {
        id: `${o.kode} tepat waktu${jam}`,
        en: `${o.kode} on time${jam}`,
        zh: `${o.kode} 准时${jam}`,
      }[lang];
      break;
    case "telat": {
      const rp = o.potong ? rpTeks(o.potong) : "";
      s = {
        id: `${o.kode} telat ${lama} menit${jam}${rp ? `, potong ${rp}` : ""}`,
        en: `${o.kode} ${lama} minutes late${jam}${rp ? `, ${rp} off` : ""}`,
        zh: `${o.kode} 迟到 ${lama} 分钟${jam}${rp ? `，扣 ${rp}` : ""}`,
      }[lang];
      break;
    }
    case "mm": {
      const rp = o.potong !== undefined ? rpTeks(o.potong) : "";
      s =
        o.hitungMangkir !== false
          ? {
              id: `${o.kode} Mangkir Mengajar${jam}, dihitung Mangkir`,
              en: `${o.kode} Mangkir Mengajar${jam}, counted as Mangkir`,
              zh: `${o.kode} Mangkir Mengajar${jam}，按 Mangkir 计`,
            }[lang]
          : rp
            ? {
                id: `${o.kode} Mangkir Mengajar${jam}, potong ${rp}`,
                en: `${o.kode} Mangkir Mengajar${jam}, ${rp} off`,
                zh: `${o.kode} Mangkir Mengajar${jam}，扣 ${rp}`,
              }[lang]
            : `${o.kode} Mangkir Mengajar${jam}`;
      break;
    }
    case "mangkir":
      s = `${o.kode} Mangkir`;
      break;
    case "izin":
      s = lang === "en" ? `${o.kode} excused` : `${o.kode} Izin`;
      break;
    default:
      s = {
        id: `${o.kode} belum hadir`,
        en: `${o.kode} not here yet`,
        zh: `${o.kode} 还没到`,
      }[lang];
  }
  for (const a of o.ambilAlih ?? []) {
    const g = a.nomor === null ? "" : String(a.nomor);
    s += {
      id: `, ${g ? `kelompok ${g}` : "kelompoknya"} diambil alih ${a.kode} ${a.jam}`,
      en: `, ${a.kode} took over ${g ? `group ${g}` : "the group"} at ${a.jam}`,
      zh: `，${a.kode} ${a.jam} 接手了${g ? `第 ${g} 组` : "这个组"}`,
    }[lang];
  }
  return s;
}

/** The score-input sentence: groups done that day, and the ones recorded as Lupa Input Nilai. */
function kalimatNilai(nilai: NonNullable<TeksHadirMasukan["nilai"]>, lang: LangHadir): string {
  const nama = (n: number[]) =>
    ({
      id: `Kelompok ${daftarNomor(n, lang)}`,
      en: `${n.length === 1 ? "group" : "groups"} ${daftarNomor(n, lang)}`,
      zh: `第 ${daftarNomor(n, lang)} 组`,
    })[lang];
  const klausa: string[] = [];
  const selesai = nilai.filter((x) => !x.lupa).map((x) => x.nomor);
  if (selesai.length)
    klausa.push(
      `${nama(selesai)} ${{ id: "selesai hari itu", en: "done that day", zh: "当天完成" }[lang]}`,
    );
  const perAkhir = new Map<string, number[]>();
  for (const x of nilai.filter((y) => y.lupa))
    perAkhir.set(x.menyusul ?? "", [...(perAkhir.get(x.menyusul ?? "") ?? []), x.nomor]);
  for (const [menyusul, n] of perAkhir) {
    const akhir = menyusul
      ? {
          id: `diinput menyusul ${menyusul} dengan Token Khusus`,
          en: `put in late ${menyusul} with a Token Khusus`,
          zh: `${menyusul} 用 Token Khusus 补录`,
        }[lang]
      : { id: "belum diinput", en: "not put in yet", zh: "还没有录入" }[lang];
    klausa.push(`${nama(n)} Lupa Input Nilai, ${akhir}`);
  }
  const awal = { id: "Input Nilai: ", en: "Scores: ", zh: "分数录入：" }[lang];
  return awal + klausa.join(lang === "zh" ? "；" : "; ");
}

/**
 * The plain report sentence for one session (Laporan, "Salin Teks Laporan"),
 * like the other written reports: attendance first, then score input. No em
 * or en dashes: the report is pasted into chats and documents.
 */
export function teksLaporanHadir(m: TeksHadirMasukan): string {
  const { lang } = m;
  const akhir = lang === "zh" ? "。" : ".";
  const bagian: string[] = [];
  const tambah = (s: string) => bagian.push(s + akhir);

  tambah(
    {
      id: `Kehadiran Asisten, ${m.tanggal}, ${m.sesi} (${m.modul}, ${m.kelas})`,
      en: `Asisten attendance, ${m.tanggal}, ${m.sesi} (${m.modul}, ${m.kelas})`,
      zh: `助教出勤，${m.tanggal}，${m.sesi}（${m.modul}，${m.kelas}）`,
    }[lang],
  );
  if (m.mulaiOtomatis)
    tambah(
      {
        id: `Dimulai otomatis oleh IRIS ${m.mulaiOtomatis}`,
        en: `Started by IRIS at ${m.mulaiOtomatis}`,
        zh: `IRIS 在 ${m.mulaiOtomatis} 自动开始`,
      }[lang],
    );
  if (m.geser)
    tambah(
      {
        id: `Jam digeser dari ${m.geser.dari} ke ${m.geser.ke} (${m.geser.alasan})`,
        en: `Clock moved from ${m.geser.dari} to ${m.geser.ke} (${m.geser.alasan})`,
        zh: `时间从 ${m.geser.dari} 调到 ${m.geser.ke}（${m.geser.alasan}）`,
      }[lang],
    );
  else tambah({ id: "Jam tidak digeser", en: "Clock not moved", zh: "时间未调整" }[lang]);

  for (const o of m.orang) {
    if (o.status === "lepas") continue;
    tambah(kalimatOrang(o, lang));
    if (o.ubah)
      tambah(
        {
          id: `Diubah PJ ${o.ubah.oleh}: ${o.ubah.alasan}`,
          en: `Changed by PJ ${o.ubah.oleh}: ${o.ubah.alasan}`,
          zh: `PJ ${o.ubah.oleh} 已修改：${o.ubah.alasan}`,
        }[lang],
      );
  }
  if (m.nilai && m.nilai.length) tambah(kalimatNilai(m.nilai, lang));
  return bagian.join(lang === "zh" ? "" : " ");
}
