/**
 * What each action does, for TipLayer's tooltips (2026-10-14), keyed by the
 * label a person sees on the control in that language. The explanations
 * live in tips-data.ts; labels made from data (a slot, a count, a name)
 * match the patterns below; a tab, a switch or a filter chip without its
 * own entry says what pressing it does. A control whose label means
 * something else in one place gives its own `data-tip` instead.
 */
import { TIPS } from "./tips-data.js";

export type BahasaTip = "id" | "en" | "zh";

/** What kind of control it is, for the fallbacks. */
export interface JenisTip {
  role?: string | null;
  /** aria-pressed or aria-checked is set: a filter or an on/off choice. */
  pilih?: boolean;
}

/** A label as the table keys it: one line, single spaces, no badge count. */
export function kunciTip(label: string): string {
  return bersihkan(barisTip(label)[0] ?? "");
}

function bersihkan(baris: string): string {
  return baris
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*[A-Z0-9]{1,3}$/, "") // a shortcut hint ("Perpanjang · E")
    .trim();
}

/** The label's lines that carry words: a count or an icon's empty line on
 *  top ("3", then "Kelompokku") is skipped. */
function barisTip(label: string): string[] {
  return label
    .split("\n")
    .map(bersihkan)
    .filter((b) => b && !/^[\d\s.,%/]+$/.test(b));
}

type Pola = [RegExp, (m: RegExpMatchArray) => string];

/** Labels made from data, per language. */
const POLA: Record<BahasaTip, Pola[]> = {
  id: [
    [/^Modul (\d)\b/i, (m) => `Menampilkan Modul ${m[1]}.`],
    [/^Slot (\d), \d\d:\d\d/, (m) => `Membuka slot ${m[1]} hari ini.`],
    [/^Cek Modul (\d)$/, (m) => `Memeriksa kesiapan PC Server untuk Modul ${m[1]}.`],
    [/^Nyalakan (.+)$/, (m) => `Menyalakan layanan ${m[1]} di PC Server.`],
    [/^Lihat Log(?: (.+))?$/, (m) => `Menampilkan log ${m[1] ?? "layanan ini"}.`],
    [/^Urutkan menurut (.+)$/, (m) => `Mengurutkan daftar menurut ${m[1]}.`],
    [/^Mulai TOT (.+)$/, (m) => `Memulai sesi TOT ${m[1]}.`],
    [/^Keluarkan (\w+)$/, (m) => `Mengeluarkan akun ${m[1]} dari Mode TOT.`],
    [/^Hapus · (.+)$/, (m) => `Menghapus sesi TOT ${m[1]}.`],
    [/^Hapus (.+)$/, (m) => `Menghapus ${m[1]}.`],
    [/^(\d+) menit$/, (m) => `Mengatur lama sesi jadi ${m[1]} menit.`],
    [/^\d+ (ASO|ARD|ADS|ADC|AER|ARM)$/, (m) => `Memilih divisi ${m[1]}.`],
    [/^(\d+) Jabatan Kosong$/, () => "Menampilkan jabatan yang belum terisi."],
    [/^Rentang tanggal/, () => "Memilih rentang tanggal yang ditampilkan."],
    [/^Pilih jam/, () => "Memilih jam."],
    [/^(Sebelumnya|Kembali): (.+)$/, (m) => `Kembali ke langkah ${m[2]}.`],
    [/^Lanjut: (.+)$/, (m) => `Lanjut ke langkah ${m[1]}.`],
    [/^Buat di (\d+) Kelas$/, (m) => `Membuat tugas TP di ${m[1]} kelas yang belum punya.`],
    [/^Buka (\w+) Slot (\d)$/, (m) => `Membuka persiapan slot ${m[2]} hari ${m[1]}.`],
    [
      /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu) · Slot (\d)/,
      (m) => `Membuka slot ${m[2]} hari ${m[1]}: asisten, kelompok, dan jadwalnya.`,
    ],
    [
      /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu) Slot (\d)/,
      (m) => `Membuka slot ${m[2]} hari ${m[1]}.`,
    ],
    [/^[A-Z]{3}$/, (m) => `Menampilkan rincian asisten ${m[0]}.`],
    [/^Kelompok (\d+)$/, (m) => `Membuka Kelompok ${m[1]}.`],
    [/^(Ganjil|Genap) \d{4}\/\d{4}$/, () => "Memilih semester yang ditampilkan."],
  ],
  en: [
    [/^Module (\d)\b/i, (m) => `Shows Module ${m[1]}.`],
    [/^Slot (\d), \d\d:\d\d/, (m) => `Opens today's slot ${m[1]}.`],
    [/^Check Module (\d)$/, (m) => `Checks the PC Server's readiness for Module ${m[1]}.`],
    [/^(?:Start|Turn On) (.+)$/, (m) => `Starts ${m[1]} on the PC Server.`],
    [/^View Log(?: (.+))?$/, (m) => `Shows the log of ${m[1] ?? "this service"}.`],
    [/^Sort by (.+)$/, (m) => `Sorts the list by ${m[1]}.`],
    [/^Start TOT (.+)$/, (m) => `Starts a TOT session for ${m[1]}.`],
    [/^Delete · (.+)$/, (m) => `Deletes the TOT session of ${m[1]}.`],
    [/^(?:Delete|Remove) (.+)$/, (m) => `Deletes ${m[1]}.`],
    [/^(\d+) min(utes)?$/, (m) => `Sets the session to ${m[1]} minutes.`],
    [/^\d+ (ASO|ARD|ADS|ADC|AER|ARM)$/, (m) => `Picks the ${m[1]} division.`],
    [/^(\d+) Vacant Roles?$/, () => "Shows the roles nobody holds yet."],
    [/^Date range/, () => "Picks the date range shown."],
    [/^Pick (an hour|a time)/i, () => "Picks the time."],
    [/^(Previous|Back): (.+)$/, (m) => `Goes back to the ${m[2]} step.`],
    [/^Next: (.+)$/, (m) => `Goes on to the ${m[1]} step.`],
    [
      /^Make in (\d+) Class(es)?$/,
      (m) => `Creates the TP assignment in the ${m[1]} classes that lack it.`,
    ],
    [/^Open (\w+) Slot (\d)$/, (m) => `Opens the preparation of ${m[1]}'s slot ${m[2]}.`],
    [
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) · Slot (\d)/,
      (m) => `Opens ${m[1]}'s slot ${m[2]}: its assistants, groups and schedule.`,
    ],
    [
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) Slot (\d)/,
      (m) => `Opens ${m[1]}'s slot ${m[2]}.`,
    ],
    [/^[A-Z]{3}$/, (m) => `Shows assistant ${m[0]}'s details.`],
    [/^Group (\d+)$/, (m) => `Opens Group ${m[1]}.`],
    [/^(Odd|Even) \d{4}\/\d{4}$/, () => "Picks the semester shown."],
  ],
  zh: [
    [/^模块 ?(\d)/, (m) => `显示模块 ${m[1]}。`],
    [/^第 ?(\d) ?节[,，]/, (m) => `打开今天第 ${m[1]} 节。`],
    [/^(?:删除|移除)(.+)$/, (m) => `删除${m[1]}。`],
    [/^(\d+) ?分钟$/, (m) => `把课程时长设为 ${m[1]} 分钟。`],
    [/^\d+ (ASO|ARD|ADS|ADC|AER|ARM)$/, (m) => `选择 ${m[1]} 部门。`],
    [/^(\d+) ?个职位空缺$/, () => "显示还没人担任的职位。"],
    [/^(上一步|返回)[:：] ?(.+)$/, (m) => `回到“${m[2]}”这一步。`],
    [/^下一步[:：] ?(.+)$/, (m) => `进入“${m[1]}”这一步。`],
    [/^在 ?(\d+) ?个班级创建$/, (m) => `在缺少预习作业的 ${m[1]} 个班级创建作业。`],
    [/^(星期.) ?· ?第 ?(\d) ?节/, (m) => `打开${m[1]}第 ${m[2]} 节：助教、小组和安排。`],
    [/^(星期.) ?· ?时段 ?(\d)/, (m) => `打开${m[1]}时段 ${m[2]}：助教、小组和安排。`],
    [/^打开 ?(星期.) ?时段 ?(\d)$/, (m) => `打开${m[1]}时段 ${m[2]}的准备。`],
    [/^[A-Z]{3}$/, (m) => `显示助教 ${m[0]} 的详情。`],
    [/^第 ?(\d+) ?组$/, (m) => `打开第 ${m[1]} 组。`],
    [/\d{4}\/\d{4}/, () => "选择要显示的学期。"],
  ],
};

/** A tab, a switch, a choice or a picker without its own entry. */
const UMUM: Record<
  BahasaTip,
  {
    tab: (l: string) => string;
    pilih: (l: string) => string;
    radio: (l: string) => string;
    combo: (l: string) => string;
  }
> = {
  id: {
    tab: (l) => `Membuka bagian ${l}.`,
    pilih: (l) => `Menyalakan atau mematikan: ${l}.`,
    radio: (l) => `Memilih ${l}.`,
    combo: () => "Membuka daftar pilihan.",
  },
  en: {
    tab: (l) => `Opens the ${l} section.`,
    pilih: (l) => `Turns this on or off: ${l}.`,
    radio: (l) => `Picks ${l}.`,
    combo: () => "Opens the list of choices.",
  },
  zh: {
    tab: (l) => `打开“${l}”部分。`,
    pilih: (l) => `开启或关闭：${l}。`,
    radio: (l) => `选择“${l}”。`,
    combo: () => "打开选项列表。",
  },
};

export function tipUntuk(label: string, lang: BahasaTip, jenis: JenisTip = {}): string | null {
  const k = kunciTip(label);
  if (!k) return null;
  const t = TIPS[lang];
  // The first line with words, then the others (a card's title is not
  // always on top), each also without a count beside it ("Kelompokku3").
  for (const b of barisTip(label)) {
    const tepat = t[b] ?? t[b.replace(/\s*\d+$/, "")];
    if (tepat) return tepat;
  }
  for (const [re, f] of POLA[lang]) {
    const m = k.match(re);
    if (m) return f(m);
  }
  if (k.length > 70) return null;
  if (jenis.role === "tab") return UMUM[lang].tab(k);
  // A radio carries aria-checked too: a choice, not an on/off switch.
  if (jenis.role === "radio" || jenis.role === "menuitemradio") return UMUM[lang].radio(k);
  if (jenis.role === "combobox") return UMUM[lang].combo(k);
  if (jenis.role === "switch" || jenis.pilih) return UMUM[lang].pilih(k);
  return null;
}
