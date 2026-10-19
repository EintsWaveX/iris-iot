/**
 * The Lab Profile on Home (Phase 23): what the editor at /lab-profile may
 * write and what Home reads from GET /api/profil/baca. Browser-safe; the
 * API (api/_lib/profil.ts) checks every write with the same rules.
 *
 * People on the profile are public by the user's ruling (2026-10-19):
 * name, code, division, position and photo of every active Asisten. The
 * NIM never is: nothing here carries one.
 */
import type { Lang } from "./kelas.js";
import { DIVISI, INTI, type Divisi, type Inti } from "./hak.js";

/** A text the editor writes, in all three languages. */
export type TeksTiga = { id: string; en: string; zh: string };

export const BAHASA_TEKS = ["id", "en", "zh"] as const;

export const JENIS_ACARA = ["workshop", "tot", "rekrutasi"] as const;
export type JenisAcara = (typeof JENIS_ACARA)[number];

/** Longest text per field, in characters. */
export const TEKS_MAKS = {
  baris: 160,
  deskripsi: 1200,
  keterangan: 300,
  judul: 120,
  tempat: 120,
  ringkasan: 2000,
  alt: 200,
} as const;
export type FieldTeks = keyof typeof TEKS_MAKS;

/** Photos per edition, and the size a photo may have before it is shrunk. */
export const FOTO_PER_ACARA = 40;
export const FOTO_MAKS_MASUK = 10 * 1024 * 1024;
export const FOTO_TIPE_MASUK = ["image/png", "image/jpeg", "image/webp"];
/** What the browser uploads after shrinking: WebP, long edge 1600 and 480. */
export const FOTO_SISI_BESAR = 1600;
export const FOTO_SISI_KECIL = 480;

/* ------------------------------------------------------------- reading */

export type HasilTeks =
  | { ok: true; teks: TeksTiga }
  | { ok: false; kode: "kurang"; kurang: Lang[] }
  | { ok: false; kode: "terlalu_panjang"; bahasa: Lang };

/** All three languages, trimmed, each within `maks`. */
export function bacaTeks(v: unknown, maks: number): HasilTeks {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const teks = {} as TeksTiga;
  const kurang: Lang[] = [];
  for (const b of BAHASA_TEKS) {
    const s = typeof o[b] === "string" ? (o[b] as string).trim() : "";
    if (!s) kurang.push(b);
    else if (s.length > maks) return { ok: false, kode: "terlalu_panjang", bahasa: b };
    teks[b] = s;
  }
  return kurang.length ? { ok: false, kode: "kurang", kurang } : { ok: true, teks };
}

/** Like bacaTeks, but three empty boxes mean "none" (null). */
export function bacaTeksOpsional(v: unknown, maks: number): HasilTeks | { ok: true; teks: null } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const kosong = BAHASA_TEKS.every((b) => typeof o[b] !== "string" || !(o[b] as string).trim());
  return kosong ? { ok: true, teks: null } : bacaTeks(v, maks);
}

/** The languages still empty in a text the editor is typing. */
export function bahasaKosong(t: Partial<TeksTiga> | null | undefined): Lang[] {
  return BAHASA_TEKS.filter((b) => !t?.[b]?.trim());
}

/** "2026/2027": a kepengurusan year, the second year right after the first. */
export function tahunValid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})\/(\d{4})$/.exec(v);
  return !!m && Number(m[2]) === Number(m[1]) + 1 && Number(m[1]) >= 2000;
}

/** A real calendar date as YYYY-MM-DD. */
export function tanggalValid(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isJenisAcara(v: unknown): v is JenisAcara {
  return typeof v === "string" && (JENIS_ACARA as readonly string[]).includes(v);
}

/** The text in the reader's language. */
export function teksDi(t: TeksTiga | null | undefined, lang: Lang): string {
  return t ? t[lang] || t.id : "";
}

/* ----------------------------------------------------------- the payload */

/** A person's `kecil` is what avatars show, so it may be a face crop of
 *  `besar`; a division's or an event's is `besar` made small. */
export interface Foto {
  besar: string;
  kecil: string;
}

/** A person as Home shows them. Never a NIM. */
export interface OrangProfil {
  nama: string;
  kode: string;
  /** An Inti position, "kepala" or "anggota". */
  peran: Inti | "kepala" | "anggota";
  foto: Foto | null;
  /** An inactive Asisten shown by the editor's choice; not counted as active. */
  nonaktif?: true;
}

/** An inactive Asisten as the editor lists them, to show or hide. */
export interface NonaktifProfil {
  kode: string;
  nama: string;
  divisi: string | null;
  tampil: boolean;
}

export interface DivisiProfil {
  kode: Divisi;
  foto: Foto | null;
  baris: TeksTiga;
  deskripsi: TeksTiga;
  anggota: OrangProfil[];
}

/** The Inti as a group, shown like a division: its photo and texts. */
export interface IntiProfil {
  foto: Foto | null;
  baris: TeksTiga;
  deskripsi: TeksTiga;
}

export interface FotoBersama {
  id: number;
  tahun: string;
  foto: Foto;
  keterangan: TeksTiga;
}

export interface FotoAcara extends Foto {
  id: number;
  alt: TeksTiga | null;
}

export interface Acara {
  id: number;
  jenis: JenisAcara;
  judul: TeksTiga;
  tempat: TeksTiga;
  ringkasan: TeksTiga;
  tanggal: string;
  sampulId: number | null;
  foto: FotoAcara[];
}

export interface ProfilData {
  ok: true;
  inti: OrangProfil[];
  intiGrup: IntiProfil;
  divisi: DivisiProfil[];
  /** Newest year first. */
  bersama: FotoBersama[];
  /** Oldest first within each kind, the order the coverflows read. */
  acara: Acara[];
}

/** The photo an edition's card shows: the chosen cover, else the first. */
export function sampulAcara(a: Pick<Acara, "sampulId" | "foto">): FotoAcara | null {
  return a.foto.find((f) => f.id === a.sampulId) ?? a.foto[0] ?? null;
}

/** Inti first by position, then each division's Kepala before its members. */
export function urutOrang<T extends { nama: string; peran: OrangProfil["peran"] }>(
  list: readonly T[],
): T[] {
  const rank = (p: OrangProfil["peran"]) =>
    (INTI as readonly string[]).includes(p)
      ? (INTI as readonly string[]).indexOf(p)
      : p === "kepala"
        ? 10
        : 20;
  return [...list].sort((a, b) => rank(a.peran) - rank(b.peran) || a.nama.localeCompare(b.nama));
}

/** Kepengurusan years, newest first. */
export function urutTahun<T extends { tahun: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.tahun.localeCompare(a.tahun));
}

/* -------------------------------------------------- the six divisions */

export interface InfoDivisi {
  /** The division's official name (the same in every language). */
  nama: string;
  /** The card's accent, a kit-friendly hue. */
  warna: string;
  /** Built-in texts until an editor saves the division's own. */
  baris: TeksTiga;
  deskripsi: TeksTiga;
}

export const INFO_DIVISI: Record<Divisi, InfoDivisi> = {
  ASO: {
    nama: "Academic Standard Operations",
    warna: "#40b0ff",
    baris: {
      id: "Modul, TP, TA dan jurnal praktikum.",
      en: "Modules, prelabs, tests and journals.",
      zh: "模块、预习、测验和实验日志。",
    },
    deskripsi: {
      id: "Menyusun TP, TA, jurnal dan evaluasi lain. Menulis, memperbarui dan menguji modul praktikum, lalu menyamakan cara materi diajarkan di setiap sesi.",
      en: "Writes the prelabs, tests, journals and other evaluations. Writes, updates and trials the practicum modules, and keeps how the material is taught the same in every session.",
      zh: "编写预习、测验、实验日志和其他评估。编写、更新并试做实验模块，让每节课的教法保持一致。",
    },
  },
  ARD: {
    nama: "Advanced Research and Development",
    warna: "#a78bfa",
    baris: {
      id: "Riset dan alat IoT buatan lab.",
      en: "Research and the lab's own IoT tools.",
      zh: "研究和实验室自制的物联网工具。",
    },
    deskripsi: {
      id: "Membangun alat IoT, bisa bersama dosen, dan membimbing Asisten yang ingin menerbitkan karya dari lab.",
      en: "Builds IoT tools, sometimes with lecturers, and mentors Asisten who want to publish work from the lab.",
      zh: "制作物联网工具，有时与老师合作，并指导想发表实验室成果的助教。",
    },
  },
  ADS: {
    nama: "Attitude and Discipline Standards",
    warna: "#fb7185",
    baris: {
      id: "Aturan lab dan kehadiran.",
      en: "Lab rules and attendance.",
      zh: "实验室规定和考勤。",
    },
    deskripsi: {
      id: "Menjaga aturan lab: seragam, tanpa makan dan minum, etika komunikasi. Mencatat kehadiran Praktikan dan Asisten, serta memberi peringatan dan teguran untuk pelanggaran SOP.",
      en: "Keeps the lab rules: uniform, no food or drink, communication etiquette. Records Praktikan and Asisten attendance, and gives warnings and reprimands for SOP breaches.",
      zh: "维护实验室规定：穿制服、禁止饮食、沟通礼仪。记录学生和助教的出勤，对违反 SOP 的行为给予警告和批评。",
    },
  },
  ADC: {
    nama: "Administration and Creative Documentation",
    warna: "#f5b544",
    baris: {
      id: "Foto, video dan media sosial.",
      en: "Photos, video and social media.",
      zh: "照片、视频和社交媒体。",
    },
    deskripsi: {
      id: "Mendokumentasikan setiap acara lab lewat foto dan video, mengelola media sosial, dan mengisi halaman ini.",
      en: "Documents every lab event in photos and video, runs the social media, and keeps this page filled.",
      zh: "用照片和视频记录实验室的每次活动，运营社交媒体，并维护这个页面的内容。",
    },
  },
  AER: {
    nama: "Affairs and External Relations",
    warna: "#5eead4",
    baris: {
      id: "Acara eksternal dan pengadaan.",
      en: "External events and procurement.",
      zh: "对外活动和采购。",
    },
    deskripsi: {
      id: "Mengurus acara eksternal, vendor, dan pengadaan identitas lab seperti PDH, jaket, lanyard, stiker dan merchandise Open Recruitment.",
      en: "Handles external events, vendors, and the lab's identity items such as PDH, jackets, lanyards, stickers and Open Recruitment merchandise.",
      zh: "负责对外活动、供应商，以及实验室的标识物品，例如 PDH、外套、挂绳、贴纸和 Open Recruitment 周边。",
    },
  },
  ARM: {
    nama: "Asset Resource Management",
    warna: "#7dd3fc",
    baris: {
      id: "Aset, perawatan dan server lab.",
      en: "Assets, upkeep and the lab servers.",
      zh: "资产、维护和实验室服务器。",
    },
    deskripsi: {
      id: "Mendata, memberi label dan memeriksa aset lab, merawatnya secara rutin, serta mengelola barang habis pakai dan tidak habis pakai.",
      en: "Inventories, labels and checks the lab's assets, maintains them routinely, and manages consumable and non consumable stock.",
      zh: "清点、标记并检查实验室资产，定期维护，并管理消耗品和非消耗品。",
    },
  },
};

/** The Inti's key in profil_divisi, beside the six divisions'. */
export const KUNCI_INTI = "INTI";

export const INFO_INTI: Pick<InfoDivisi, "warna" | "baris" | "deskripsi"> = {
  warna: "#38bdf8",
  baris: {
    id: "Koordinator, wakil, sekretaris dan bendahara lab.",
    en: "The lab's coordinator, vice coordinator, secretary and treasurer.",
    zh: "实验室的协调员、副协调员、秘书和财务。",
  },
  deskripsi: {
    id: "Memimpin dan menyatukan keenam divisi, menetapkan jadwal dan keputusan praktikum, serta mengurus surat menyurat dan keuangan lab.",
    en: "Leads and brings the six divisions together, sets the practicum's schedule and decisions, and handles the lab's letters and finances.",
    zh: "领导并统筹六个部门，确定实验课的日程和决定，并负责实验室的文书和财务。",
  },
};

export { DIVISI };
