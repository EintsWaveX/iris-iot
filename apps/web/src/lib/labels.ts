/**
 * The words for the practicum's units, written out in full in each
 * interface language (Phase 9: no abbreviations such as K1, G1, M3,
 * INTER, Prep or mnt anywhere in the interface). Browser-safe.
 */
import type { Kelas, Lang } from "./kelas.js";
import { divisiKepala, type Inti, type Kategori, type StatusOrang, type Tier } from "./hak.js";

/** "Modul 2", "Module 2", "模块 2" */
export function modulLabel(n: number, lang: Lang): string {
  return lang === "en" ? `Module ${n}` : lang === "zh" ? `模块 ${n}` : `Modul ${n}`;
}

/** One short string in three languages, for a lone label that doesn't
 *  merit its own dict() table. */
export function tri(lang: Lang, id: string, en: string, zh: string): string {
  return lang === "zh" ? zh : lang === "en" ? en : id;
}

/** The word every empty value shows (ui/Nil.tsx draws it muted). */
export function nil(lang: Lang): string {
  return tri(lang, "Belum ada", "None yet", "暂无");
}

/** "Slot 2", "Slot 2", "时段 2" */
export function slotLabel(n: number, lang: Lang): string {
  return lang === "zh" ? `时段 ${n}` : `Slot ${n}`;
}

/** "Kelompok 3", "Group 3", "第 3 组" */
export function kelompokLabel(n: number, lang: Lang): string {
  return lang === "en" ? `Group ${n}` : lang === "zh" ? `第 ${n} 组` : `Kelompok ${n}`;
}

/** "Reguler", "Regular", "普通班"; "Internasional", "International", "国际班" */
export function kelasLabel(k: Kelas, lang: Lang): string {
  if (k === "internasional") {
    return lang === "en" ? "International" : lang === "zh" ? "国际班" : "Internasional";
  }
  return lang === "en" ? "Regular" : lang === "zh" ? "普通班" : "Reguler";
}

/** "30 menit", "30 minutes" (one: "1 minute"), "30 分钟" */
export function menitLabel(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 minute" : `${n} minutes`;
  return lang === "zh" ? `${n} 分钟` : `${n} menit`;
}

/** "58 detik", "58 seconds" (one: "1 second"), "58 秒" */
export function detikLabel(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 second" : `${n} seconds`;
  return lang === "zh" ? `${n} 秒` : `${n} detik`;
}

function en(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** A length of time in words: "2 jam 5 menit", "2 hours 5 minutes",
 *  "2 小时 5 分钟". Days show with hours, hours with minutes, and anything
 *  under an hour in minutes. */
export function durasiLabel(totalMenit: number, lang: Lang): string {
  const m = Math.max(0, Math.round(totalMenit));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) {
    if (lang === "en") return h ? `${en(d, "day")} ${en(h, "hour")}` : en(d, "day");
    if (lang === "zh") return h ? `${d} 天 ${h} 小时` : `${d} 天`;
    return h ? `${d} hari ${h} jam` : `${d} hari`;
  }
  if (h > 0) {
    if (lang === "en") return mm ? `${en(h, "hour")} ${en(mm, "minute")}` : en(h, "hour");
    if (lang === "zh") return mm ? `${h} 小时 ${mm} 分钟` : `${h} 小时`;
    return mm ? `${h} jam ${mm} menit` : `${h} jam`;
  }
  return menitLabel(mm, lang);
}

/** How long ago, the one way IRIS writes history: "00:04:12 lalu",
 *  "2 hari (03:14:07) lalu", and past 30 days "lebih dari 30 hari lalu". */
export function laluLabel(detik: number, lang: Lang): string {
  const s = Math.max(0, Math.floor(detik));
  if (s > 30 * 86400) {
    if (lang === "en") return "more than 30 days ago";
    return lang === "zh" ? "超过 30 天前" : "lebih dari 30 hari lalu";
  }
  const d = Math.floor(s / 86400);
  const jms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  if (!d) {
    if (lang === "en") return `${jms} ago`;
    return lang === "zh" ? `${jms} 前` : `${jms} lalu`;
  }
  if (lang === "en") return `${en(d, "day")} (${jms}) ago`;
  return lang === "zh" ? `${d} 天（${jms}）前` : `${d} hari (${jms}) lalu`;
}

/** "Senin", "Monday", "星期一" (1 = Senin ... 6 = Sabtu, 0 = Minggu) */
export function hariLabel(h: number, lang: Lang): string {
  const id = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const en = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const zh = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return (lang === "en" ? en : lang === "zh" ? zh : id)[h] ?? String(h);
}

type Tri = readonly [id: string, en: string, zh: string];
const pick = (t: Tri, lang: Lang) => (lang === "en" ? t[1] : lang === "zh" ? t[2] : t[0]);

const TIER: Record<Tier, Tri> = {
  admin: ["Admin", "Admin", "管理员"],
  pengelola: ["Pengelola", "Manager", "主管"],
  asisten: ["Asisten", "Assistant", "助教"],
};

/** The tier (role) a position gives: Admin, Pengelola, Asisten. */
export function tierLabel(t: Tier, lang: Lang): string {
  return pick(TIER[t] ?? TIER.asisten, lang);
}

const JABATAN: Record<Inti | "kepala" | "anggota", Tri> = {
  ketua: ["Koordinator Asisten", "Assistant Coordinator", "助教协调人"],
  wakil: ["Wakil Koordinator Asisten", "Vice Assistant Coordinator", "助教副协调人"],
  sekretaris: ["Sekretaris", "Secretary", "秘书"],
  bendahara: ["Bendahara", "Treasurer", "财务"],
  kepala: ["Kepala Divisi", "Division Chief", "部门负责人"],
  anggota: ["Anggota Divisi", "Division Member", "部门成员"],
};

/** A head role's name: "Bendahara", "Kepala Divisi ARD", "ARD 部门负责人". */
export function kategoriLabel(k: Kategori, lang: Lang): string {
  const div = divisiKepala(k);
  if (!div) return pick(JABATAN[k as Inti], lang);
  return lang === "zh" ? `${div} ${JABATAN.kepala[2]}` : `${pick(JABATAN.kepala, lang)} ${div}`;
}

/** A person's position: their head role, or "Anggota Divisi ASO". */
export function jabatanLabel(k: Kategori | null, divisi: string | null, lang: Lang): string {
  if (k) return kategoriLabel(k, lang);
  const base = pick(JABATAN.anggota, lang);
  if (!divisi) return base;
  return lang === "zh" ? `${divisi} ${base}` : `${base} ${divisi}`;
}

const STATUS: Record<StatusOrang, Tri> = {
  aktif: ["Aktif", "Active", "在岗"],
  cuti: ["Cuti", "On Leave", "休假中"],
  nonaktif: ["Nonaktif", "Inactive", "停用"],
  alumni: ["Alumni", "Alumni", "已毕业"],
};

/** A person's membership status. */
export function statusOrangLabel(s: StatusOrang, lang: Lang): string {
  return pick(STATUS[s] ?? STATUS.aktif, lang);
}

/** A person's position as the Tim data stores it (Indonesian and English);
 *  Mandarin is built from the English ("Member of ASO Division"). */
export function divisiLabel(d: { id: string; en: string }, lang: Lang): string {
  if (lang !== "zh") return d[lang];
  const m = /^(Member|Chief) of (\w+) Division$/.exec(d.en);
  if (m) return `${m[2]} 部${m[1] === "Chief" ? "部长" : "成员"}`;
  const tetap: Record<string, string> = {
    "Assistant Coordinator": "助教协调人",
    "Vice Assistant Coordinator": "助教副协调人",
    Secretary: "秘书",
    Treasurer: "财务",
    Research: "研究",
  };
  return tetap[d.en] ?? d.en;
}
