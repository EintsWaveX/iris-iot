/**
 * TP notices (2026-10-21, the LMS Pengumuman's, now shown inside IRIS): what
 * an Asisten posts to Praktikan about TP, from a template or written freely,
 * and the two automatic ones, each off until switched on: the window opened
 * (for its first day), and three hours to the close (only to those who
 * haven't handed in). Reguler reads Indonesian, INT English.
 */
import type { JendelaTp, KelasTp } from "./tp.js";

export type JenisKabar = "bebas" | "buka" | "tutup" | "nilai" | "ingat";
export type SasaranKabar = "semua" | "belum";
export interface TeksKabar {
  id: string;
  en: string;
}

export const JENIS_KABAR: readonly JenisKabar[] = ["bebas", "buka", "ingat", "tutup", "nilai"];
export const JUDUL_MAKS = 120;
export const ISI_MAKS = 1000;

/** A notice as kept (tp_kabar). */
export interface KabarSimpan {
  id: number;
  modul: number | null;
  jenis: JenisKabar;
  sasaran: SasaranKabar;
  judul: TeksKabar;
  isi: TeksKabar;
  mulai: string;
  sampai: string | null;
}

/** The automatic notices (pengaturan tp_kabar_oto). */
export interface OtoKabar {
  buka: boolean;
  mepet: boolean;
}
export const OTO_MATI: OtoKabar = { buka: false, mepet: false };

/** A notice as one Praktikan sees it, in their class's language. */
export interface KabarTampil {
  /** "k12" for a kept one, "buka-2" or "ingat-2" for an automatic one,
   *  "panjang-2-<end>" and "nilai-2" for their own. */
  id: string;
  modul: number | null;
  jenis: JenisKabar | "panjang";
  judul: string;
  isi: string;
  pada: string;
}

/** An automatic notice shows this long after the opening. */
export const BUKA_TAMPIL_MS = 24 * 3600_000;
/** And this long before the close. */
export const MEPET_MS = 3 * 3600_000;
/** Their own score's notice shows this long after the group's Kirim Nilai. */
export const NILAI_TAMPIL_MS = 3 * 86_400_000;

/** One Praktikan's own: an extension running, a score out (always on). */
export interface KabarPribadi {
  panjang: Map<number, { sampai: string; pada: string }>;
  nilai: Map<number, { total: number; pada: string }>;
}

/** A full WIB date and time for the notice's text: "Sabtu, 24 Oktober 2026 · 18:00". */
export function waktuKabar(iso: string, b: "id" | "en"): string {
  const d = new Date(iso);
  const tgl = new Intl.DateTimeFormat(b === "id" ? "id-ID" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
  const jam = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(d);
  return `${tgl} · ${jam}`;
}

/** A template's title, text and audience for a module and its window. */
export function templatKabar(
  jenis: JenisKabar,
  modul: number,
  j: JendelaTp | null,
): { judul: TeksKabar; isi: TeksKabar; sasaran: SasaranKabar } {
  const tutup = (b: "id" | "en") =>
    j ? waktuKabar(j.tutup, b) : b === "id" ? "jendelanya ditutup" : "the window closes";
  switch (jenis) {
    case "buka":
      return {
        sasaran: "semua",
        judul: { id: `TP Modul ${modul} sudah dibuka`, en: `TP Modul ${modul} is open` },
        isi: {
          id: `Kerjakan di kertas, foto atau pindai, lalu unggah di langkah TP halaman Modul ${modul} sebelum ${tutup("id")}.`,
          en: `Work it on paper, photograph or scan it, then upload it in the TP step of the Module ${modul} page before ${tutup("en")}.`,
        },
      };
    case "ingat":
      return {
        sasaran: "belum",
        judul: { id: `Jangan lupa TP Modul ${modul}`, en: `Don't forget TP Modul ${modul}` },
        isi: {
          id: `Kamu belum mengumpulkan TP Modul ${modul}. Unggah di langkah TP halaman Modul ${modul} sebelum ${tutup("id")}.`,
          en: `You haven't handed in TP Modul ${modul} yet. Upload it in the TP step of the Module ${modul} page before ${tutup("en")}.`,
        },
      };
    case "tutup":
      return {
        sasaran: "semua",
        judul: { id: `TP Modul ${modul} sudah ditutup`, en: `TP Modul ${modul} has closed` },
        isi: {
          id: "Terima kasih yang sudah mengumpulkan. Yang belum, minta perpanjangan ke Asisten kelompokmu.",
          en: "Thanks to everyone who handed in. If you haven't, ask your group's Asisten for an extension.",
        },
      };
    case "nilai":
      return {
        sasaran: "semua",
        judul: {
          id: `Nilai TP Modul ${modul} sudah keluar`,
          en: `TP Modul ${modul} scores are out`,
        },
        isi: {
          id: `Lihat nilaimu di langkah TP halaman Modul ${modul}. Kalau belum muncul, nilai kelompokmu belum dikirim.`,
          en: `See your score in the TP step of the Module ${modul} page. If it isn't there yet, your group's scores haven't been sent.`,
        },
      };
    default:
      return { sasaran: "semua", judul: { id: "", en: "" }, isi: { id: "", en: "" } };
  }
}

/**
 * The notices one Praktikan sees now, newest first: the kept ones inside
 * their time (a `belum` one only while they haven't handed in its module),
 * then the automatic ones that are on. `jendela` is their own window per
 * module (an extension moves the close); `belum` the modules they haven't
 * handed in; `modul` keeps only one module's (and the general ones).
 * `pribadi` adds their own: an extension while it runs and they still have
 * no file, and their score for three days after it went out (not on the
 * module page, which shows the score itself).
 */
export function kabarUntuk(p: {
  simpan: KabarSimpan[];
  oto: OtoKabar;
  jendela: Map<number, JendelaTp | null>;
  belum: Set<number>;
  kelas: KelasTp;
  now: number;
  modul?: number;
  pribadi?: KabarPribadi;
}): KabarTampil[] {
  const b = p.kelas === "inter" ? "en" : "id";
  const teks = (x: TeksKabar) => x[b].trim() || x.id;
  const out: KabarTampil[] = [];
  for (const k of p.simpan) {
    if (Date.parse(k.mulai) > p.now || (k.sampai && Date.parse(k.sampai) <= p.now)) continue;
    if (p.modul !== undefined && k.modul !== null && k.modul !== p.modul) continue;
    if (k.sasaran === "belum" && (k.modul === null || !p.belum.has(k.modul))) continue;
    out.push({
      id: `k${k.id}`,
      modul: k.modul,
      jenis: k.jenis,
      judul: teks(k.judul),
      isi: teks(k.isi),
      pada: k.mulai,
    });
  }
  for (const [m, j] of p.jendela) {
    if (!j || (p.modul !== undefined && m !== p.modul)) continue;
    const buka = Date.parse(j.buka);
    const tutup = Date.parse(j.tutup);
    if (p.oto.buka && p.now >= buka && p.now < Math.min(buka + BUKA_TAMPIL_MS, tutup)) {
      const t = templatKabar("buka", m, j);
      out.push({
        id: `buka-${m}`,
        modul: m,
        jenis: "buka",
        judul: teks(t.judul),
        isi: teks(t.isi),
        pada: j.buka,
      });
    }
    if (p.oto.mepet && p.belum.has(m) && p.now >= tutup - MEPET_MS && p.now < tutup) {
      const t = templatKabar("ingat", m, j);
      out.push({
        id: `ingat-${m}`,
        modul: m,
        jenis: "ingat",
        judul: teks(t.judul),
        isi: teks(t.isi),
        pada: new Date(tutup - MEPET_MS).toISOString(),
      });
    }
  }
  for (const [m, x] of p.pribadi?.panjang ?? []) {
    if (p.modul !== undefined && m !== p.modul) continue;
    if (!p.belum.has(m) || Date.parse(x.sampai) <= p.now) continue;
    out.push({
      id: `panjang-${m}-${x.sampai}`,
      modul: m,
      jenis: "panjang",
      judul:
        b === "id" ? `TP Modul ${m} diperpanjang untukmu` : `TP Modul ${m} is extended for you`,
      isi:
        b === "id"
          ? `Kamu masih bisa mengunggah di langkah TP halaman Modul ${m} sampai ${waktuKabar(x.sampai, b)}.`
          : `You can still upload in the TP step of the Module ${m} page until ${waktuKabar(x.sampai, b)}.`,
      pada: x.pada,
    });
  }
  for (const [m, x] of p.modul === undefined ? (p.pribadi?.nilai ?? []) : []) {
    const t = Date.parse(x.pada);
    if (p.now < t || p.now >= t + NILAI_TAMPIL_MS) continue;
    out.push({
      id: `nilai-${m}`,
      modul: m,
      jenis: "nilai",
      judul: b === "id" ? `Nilai TP Modul ${m}: ${x.total}` : `TP Modul ${m} score: ${x.total}`,
      isi:
        b === "id"
          ? `Rincian per soal ada di langkah TP halaman Modul ${m}.`
          : `The marks for each question are in the TP step of the Module ${m} page.`,
      pada: x.pada,
    });
  }
  return out.sort((a, c) => Date.parse(c.pada) - Date.parse(a.pada));
}
