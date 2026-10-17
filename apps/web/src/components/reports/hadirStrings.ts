/**
 * Words for Phase 18's reports: the session's Asisten Attendance and Score
 * Input blocks (Laporan), the semester table, and the person's counts in the
 * Tim drawer and Akun. Amounts come in as "Rp8.000" strings.
 */
import { dict } from "../../lib/app";
import type { StatusLive } from "../../lib/hadir-mengajar";

export const H = dict({
  id: {
    // Session page, attendance
    attTitle: "Kehadiran Asisten",
    attStarted: (jam: string) => `Dimulai otomatis oleh IRIS ${jam}`,
    attClockKept: "Jam tidak digeser",
    attClockMoved: (dari: string, ke: string) => `Jam digeser dari ${dari} ke ${ke}`,
    attPj: (kode: string) => `PJ ${kode}`,
    copyText: "Salin Teks Laporan",
    textTitle: "Teks Laporan",
    copied: "Teks laporan disalin.",
    copyFail: "Gagal menyalin. Coba lagi.",
    colAsisten: "Asisten",
    colHere: "Hadir",
    colStatus: "Status",
    colCut: "Potongan",
    colNote: "Catatan",
    notPaid: "Tidak dibayar",
    attNone: "Sesi ini tidak ada catatan kehadiran.",
    tookOver: (nomor: number | null, kode: string, jam: string) =>
      `${nomor === null ? "Kelompoknya" : `Kelompok ${nomor}`} diambil alih ${kode} ${jam}.`,
    changedBy: (kode: string, alasan: string) => `PJ ${kode}: ${alasan}`,
    mmCounted: "Dihitung Mangkir.",
    // Session page, score input
    scoreTitle: "Input Nilai",
    scoreHint: "Batas setiap kelompok: hari praktikum 23:59.",
    colGroup: "Kelompok",
    colSent: "Kirim Nilai",
    colSaved: "SeeLabs",
    viaRobot: (jam: string) => `Robot ${jam}`,
    viaHand: (jam: string) => `Tangan ${jam}`,
    saved: (jam: string) => `Tersimpan ${jam}`,
    lewat: (kode: string, alasan: string) => `lewat akun ${kode} (${alasan})`,
    alasanKedua: "kelompok kedua di sesi itu",
    alasanKetiga: (kode: string) => `sesi ketiga ${kode} hari itu`,
    dari: (kode: string) => ` (dari ${kode})`,
    sameDay: "Tepat Hari",
    lateIn: "Diinput Menyusul",
    lateOpen: "Lupa Input Nilai",
    open: "Belum Selesai",
    missing: (kirim: boolean, seelabs: boolean) =>
      kirim && seelabs
        ? "Kirim Nilai dan SeeLabs belum"
        : kirim
          ? "Kirim Nilai belum"
          : "SeeLabs belum",
    // Semester table
    semTitle: "Kehadiran Asisten Semester Ini",
    semHint: "Dari sesi yang sudah selesai sejak kehadiran dihitung.",
    semNone: "Belum ada sesi yang dinilai kehadirannya.",
    colOnTime: "Tepat",
    colLate: "Telat",
    colMm: "Mangkir Mengajar",
    colMangkir: "Mangkir",
    colExcused: "Izin",
    colCuts: "Potongan",
    colLupa: "Lupa Input Nilai",
    lupaCount: (n: number, menyusul: number) =>
      menyusul > 0 ? `${n} (${menyusul} menyusul)` : String(n),
    // Person counts (Tim drawer and Akun)
    teamTitle: "Kehadiran Mengajar",
    mineTitle: "Kehadiranku",
    mineHint: "Dari sesi yang sudah selesai semester ini.",
    cutsLine: "Potongan semester ini",
    unpaid: (n: number) => `${n} sesi tidak dibayar`,
    noCuts: "Tidak ada potongan",
    listEmpty: "Belum ada sesi telat, Mangkir, Izin atau Lupa Input Nilai di semester ini.",
    loadFail: "Gagal memuat kehadiran.",
    evLate: (m: number, rp: string) => `Telat ${m} Menit${rp ? ` · potong ${rp}` : ""}`,
    evMm: (jam: string, hitung: boolean, rp: string) =>
      `Mangkir Mengajar${jam ? `, hadir ${jam}` : ""} · ${hitung ? "dihitung Mangkir" : `potong ${rp}`}`,
    evMangkir: "Mangkir · sesi tidak dibayar",
    evIzin: "Izin",
    evNotHere: "Belum hadir",
    evSession: (slot: number | null) => (slot === null ? "Sesi Susulan" : `Sesi ${slot}`),
    evLupa: (nomor: number, kurang: string) => `Kelompok ${nomor} · Lupa Input Nilai · ${kurang}`,
    evLupaLate: (nomor: number, kapan: string) =>
      `Kelompok ${nomor} · Lupa Input Nilai · Diinput Menyusul ${kapan}`,
    kurangKirim: "Kirim Nilai belum",
    kurangSeelabs: "SeeLabs belum",
    kurangBoth: "Kirim Nilai dan SeeLabs belum",
  },
  en: {
    attTitle: "Asisten Attendance",
    attStarted: (jam: string) => `Started by IRIS at ${jam}`,
    attClockKept: "Clock not moved",
    attClockMoved: (dari: string, ke: string) => `Clock moved from ${dari} to ${ke}`,
    attPj: (kode: string) => `PJ ${kode}`,
    copyText: "Copy the Report Text",
    textTitle: "Report Text",
    copied: "Report text copied.",
    copyFail: "Couldn't copy. Try again.",
    colAsisten: "Asisten",
    colHere: "Here",
    colStatus: "Status",
    colCut: "Cut",
    colNote: "Note",
    notPaid: "Not paid",
    attNone: "This session has no attendance record.",
    tookOver: (nomor: number | null, kode: string, jam: string) =>
      `${kode} took over ${nomor === null ? "the group" : `Group ${nomor}`} at ${jam}.`,
    changedBy: (kode: string, alasan: string) => `PJ ${kode}: ${alasan}`,
    mmCounted: "Counted as Mangkir.",
    scoreTitle: "Score Input",
    scoreHint: "Each group's limit: 23:59 on the practicum day.",
    colGroup: "Group",
    colSent: "Kirim Nilai",
    colSaved: "SeeLabs",
    viaRobot: (jam: string) => `Robot ${jam}`,
    viaHand: (jam: string) => `By hand ${jam}`,
    saved: (jam: string) => `Saved ${jam}`,
    lewat: (kode: string, alasan: string) => `through ${kode}'s account (${alasan})`,
    alasanKedua: "a second group in that session",
    alasanKetiga: (kode: string) => `${kode}'s third session that day`,
    dari: (kode: string) => ` (from ${kode})`,
    sameDay: "Same Day",
    lateIn: "Put In Late",
    lateOpen: "Lupa Input Nilai",
    open: "Not Done Yet",
    missing: (kirim: boolean, seelabs: boolean) =>
      kirim && seelabs
        ? "Kirim Nilai and SeeLabs missing"
        : kirim
          ? "Kirim Nilai missing"
          : "SeeLabs missing",
    semTitle: "Asisten Attendance This Semester",
    semHint: "From finished sessions since attendance has been counted.",
    semNone: "No session has been judged for attendance yet.",
    colOnTime: "On Time",
    colLate: "Late",
    colMm: "Mangkir Mengajar",
    colMangkir: "Mangkir",
    colExcused: "Excused",
    colCuts: "Cuts",
    colLupa: "Lupa Input Nilai",
    lupaCount: (n: number, menyusul: number) =>
      menyusul > 0 ? `${n} (${menyusul} put in late)` : String(n),
    teamTitle: "Teaching Attendance",
    mineTitle: "My Attendance",
    mineHint: "From finished sessions this semester.",
    cutsLine: "Cuts this semester",
    unpaid: (n: number) => `${n} ${n === 1 ? "session" : "sessions"} unpaid`,
    noCuts: "No cuts",
    listEmpty: "No late, Mangkir, excused or Lupa Input Nilai sessions this semester.",
    loadFail: "Couldn't load attendance.",
    evLate: (m: number, rp: string) => `${m} Minutes Late${rp ? ` · ${rp} off` : ""}`,
    evMm: (jam: string, hitung: boolean, rp: string) =>
      `Mangkir Mengajar${jam ? `, here ${jam}` : ""} · ${hitung ? "counted as Mangkir" : `${rp} off`}`,
    evMangkir: "Mangkir · session not paid",
    evIzin: "Excused",
    evNotHere: "Not here",
    evSession: (slot: number | null) => (slot === null ? "Make-up Session" : `Session ${slot}`),
    evLupa: (nomor: number, kurang: string) => `Group ${nomor} · Lupa Input Nilai · ${kurang}`,
    evLupaLate: (nomor: number, kapan: string) =>
      `Group ${nomor} · Lupa Input Nilai · Put In Late ${kapan}`,
    kurangKirim: "Kirim Nilai missing",
    kurangSeelabs: "SeeLabs missing",
    kurangBoth: "Kirim Nilai and SeeLabs missing",
  },
  zh: {
    attTitle: "助教出勤",
    attStarted: (jam: string) => `IRIS ${jam} 自动开始`,
    attClockKept: "时间未调整",
    attClockMoved: (dari: string, ke: string) => `时间从 ${dari} 调到 ${ke}`,
    attPj: (kode: string) => `PJ ${kode}`,
    copyText: "复制报告文字",
    textTitle: "报告文字",
    copied: "报告文字已复制。",
    copyFail: "复制失败，请再试一次。",
    colAsisten: "助教",
    colHere: "到场",
    colStatus: "状态",
    colCut: "扣款",
    colNote: "备注",
    notPaid: "不计酬",
    attNone: "这节课没有出勤记录。",
    tookOver: (nomor: number | null, kode: string, jam: string) =>
      `${kode} ${jam} 接手了${nomor === null ? "这个组" : `第 ${nomor} 组`}。`,
    changedBy: (kode: string, alasan: string) => `PJ ${kode}：${alasan}`,
    mmCounted: "按 Mangkir 计。",
    scoreTitle: "分数录入",
    scoreHint: "每个组的时限：实验当天 23:59。",
    colGroup: "组",
    colSent: "发送成绩",
    colSaved: "SeeLabs",
    viaRobot: (jam: string) => `机器人 ${jam}`,
    viaHand: (jam: string) => `手动 ${jam}`,
    saved: (jam: string) => `已保存 ${jam}`,
    lewat: (kode: string, alasan: string) => `用 ${kode} 的账号（${alasan}）`,
    alasanKedua: "那节课的第二个组",
    alasanKetiga: (kode: string) => `${kode} 当天的第三节课`,
    dari: (kode: string) => `（接自 ${kode}）`,
    sameDay: "当天",
    lateIn: "补录",
    lateOpen: "Lupa Input Nilai",
    open: "未完成",
    missing: (kirim: boolean, seelabs: boolean) =>
      kirim && seelabs
        ? "发送成绩和 SeeLabs 都没完成"
        : kirim
          ? "还没发送成绩"
          : "还没存进 SeeLabs",
    semTitle: "本学期助教出勤",
    semHint: "来自开始统计出勤以来已结束的课。",
    semNone: "还没有按出勤评定过的课。",
    colOnTime: "准时",
    colLate: "迟到",
    colMm: "Mangkir Mengajar",
    colMangkir: "Mangkir",
    colExcused: "Izin",
    colCuts: "扣款",
    colLupa: "Lupa Input Nilai",
    lupaCount: (n: number, menyusul: number) =>
      menyusul > 0 ? `${n}（${menyusul} 已补录）` : String(n),
    teamTitle: "授课出勤",
    mineTitle: "我的出勤",
    mineHint: "来自本学期已结束的课。",
    cutsLine: "本学期扣款",
    unpaid: (n: number) => `${n} 节课不计酬`,
    noCuts: "没有扣款",
    listEmpty: "本学期没有迟到、Mangkir、Izin 或 Lupa Input Nilai 的课。",
    loadFail: "出勤加载失败。",
    evLate: (m: number, rp: string) => `迟到 ${m} 分钟${rp ? ` · 扣 ${rp}` : ""}`,
    evMm: (jam: string, hitung: boolean, rp: string) =>
      `Mangkir Mengajar${jam ? `，${jam} 到场` : ""} · ${hitung ? "按 Mangkir 计" : `扣 ${rp}`}`,
    evMangkir: "Mangkir · 这节课不计酬",
    evIzin: "Izin",
    evNotHere: "未到",
    evSession: (slot: number | null) => (slot === null ? "补课" : `第 ${slot} 节课`),
    evLupa: (nomor: number, kurang: string) => `第 ${nomor} 组 · Lupa Input Nilai · ${kurang}`,
    evLupaLate: (nomor: number, kapan: string) =>
      `第 ${nomor} 组 · Lupa Input Nilai · ${kapan} 补录`,
    kurangKirim: "还没发送成绩",
    kurangSeelabs: "还没存进 SeeLabs",
    kurangBoth: "发送成绩和 SeeLabs 都没完成",
  },
});

/** A status as its badge words, in each language. */
export function labelHadir(
  lang: "id" | "en" | "zh",
  status: StatusLive,
  menit: number | null,
): string {
  const m = menit ?? 0;
  switch (status) {
    case "tepat":
      return { id: "Tepat Waktu", en: "On Time", zh: "准时" }[lang];
    case "telat":
      return { id: `Telat ${m} Menit`, en: `${m} Minutes Late`, zh: `迟到 ${m} 分钟` }[lang];
    case "mm":
      return "Mangkir Mengajar";
    case "mangkir":
      return "Mangkir";
    case "izin":
      return lang === "en" ? "Excused" : "Izin";
    case "berjalan":
      return {
        id: `Belum Hadir · Telat ${m}`,
        en: `Not Here · ${m} Late`,
        zh: `未到 · 已迟到 ${m} 分钟`,
      }[lang];
    case "lewat":
      return {
        id: "Belum Hadir · Lewat Batas",
        en: "Not Here · Past the Limit",
        zh: "未到 · 超过时限",
      }[lang];
    default:
      return { id: "Belum Hadir", en: "Not Here Yet", zh: "还没到" }[lang];
  }
}

export const NADA_HADIR = {
  tepat: "ok",
  telat: "warn",
  mm: "danger",
  mangkir: "danger",
  izin: "violet",
  berjalan: "warn",
  lewat: "danger",
  belum: undefined,
  lepas: undefined,
} as const;

/** "Rp8.000" for the sentences and lists. */
export const rpPendek = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
