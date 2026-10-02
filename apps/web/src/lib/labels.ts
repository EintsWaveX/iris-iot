/**
 * The words for the practicum's units, written out in full in each
 * interface language (Phase 9: no abbreviations such as K1, G1, M3,
 * INTER, Prep or mnt anywhere in the interface). Browser-safe.
 */
import type { Kelas, Lang } from "./kelas.js";

/** "Modul 2", "Module 2", "模块 2" */
export function modulLabel(n: number, lang: Lang): string {
  return lang === "en" ? `Module ${n}` : lang === "zh" ? `模块 ${n}` : `Modul ${n}`;
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

/** "12 detik lalu", "3 minutes ago", "2 小时前": how long ago, in words. */
export function laluLabel(detik: number, lang: Lang): string {
  const s = Math.max(0, Math.round(detik));
  if (s < 60) {
    if (lang === "en") return `${en(s, "second")} ago`;
    return lang === "zh" ? `${s} 秒前` : `${s} detik lalu`;
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    if (lang === "en") return `${en(m, "minute")} ago`;
    return lang === "zh" ? `${m} 分钟前` : `${m} menit lalu`;
  }
  const h = Math.round(m / 60);
  if (lang === "en") return `${en(h, "hour")} ago`;
  return lang === "zh" ? `${h} 小时前` : `${h} jam lalu`;
}
