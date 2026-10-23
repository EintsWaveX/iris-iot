/**
 * The seed calendar's event titles and places are stored in Indonesian (one
 * `title` column). The stock ones read in English and Mandarin here; a title
 * a Panitia member typed is shown as typed. Names only: nothing here decides
 * anything, and an editor always shows the stored title.
 */
import type { Lang } from "../../lib/kelas";

const TAHAP: Record<string, [string, string]> = {
  "Tes Tulis": ["Written Test", "笔试"],
  Wawancara: ["Interview", "面试"],
  Tubes: ["Project", "项目"],
  Mengajar: ["Teaching Test", "试讲"],
};
const AWAL: Record<string, (x: [string, string]) => [string, string]> = {
  Pleno: ([e, z]) => [`${e} Plenary`, `${z}全员会议`],
  Susulan: ([e, z]) => [`${e} Makeup`, `${z}补考`],
  Cutting: ([e, z]) => [`${e} Cutting`, `${z}筛选`],
  Pengumuman: ([e, z]) => [`${e} Results`, `${z}结果公布`],
};

const TETAP: Record<string, [string, string]> = {
  "Open Recruitment": ["Open Recruitment", "开放报名"],
  Extend: ["Extension", "延长报名"],
  "Pengecekan Berkas": ["Document Check", "材料审核"],
  "Pengumuman Berkas": ["Document Screening Results", "材料筛选结果公布"],
  "First Meet": ["First Meet", "首次见面"],
  "Tes Tulis & Program": ["Written and Coding Test", "笔试与编程"],
  "Tes Wawancara": ["Interview Test", "面试"],
  "Tes Mengajar": ["Teaching Test", "试讲"],
  "Techmeet Tubes": ["Project Techmeet", "项目技术会议"],
  "Pengerjaan Tubes": ["Project Work", "项目制作"],
  "Presentasi Tubes": ["Project Presentation", "项目展示"],
};

const TEMPAT: Record<string, [string, string]> = {
  "Lab IRIS": ["IRIS Lab", "IRIS 实验室"],
};

function cari(title: string): [string, string] | null {
  if (TETAP[title]) return TETAP[title];
  const [awal, ...sisa] = title.split(" ");
  const tahap = TAHAP[sisa.join(" ")];
  return AWAL[awal] && tahap ? AWAL[awal](tahap) : null;
}

/** An event's title in the reader's language, as stored when it is not a stock one. */
export function judulAcara(e: { title: string }, lang: Lang): string {
  if (lang === "id") return e.title;
  const t = cari(e.title);
  return t ? t[lang === "en" ? 0 : 1] : e.title;
}

export function tempatAcara(place: string | null, lang: Lang): string {
  if (!place) return "";
  if (lang === "id") return place;
  const t = TEMPAT[place];
  return t ? t[lang === "en" ? 0 : 1] : place;
}
