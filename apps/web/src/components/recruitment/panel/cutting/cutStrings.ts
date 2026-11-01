/** The Cutting tab's own words, beside the shared ones in s2Strings (mockup rec7c). */
import { dict } from "../../../../lib/app";

export const CS = dict({
  id: {
    berkasHint:
      "Berkas tidak punya garis nilai: pemeriksaan Admin yang menentukan. Yang terverifikasi lolos, yang belum gagal.",
    rail: ["Usulan", "Terkunci", "Diumumkan"],
    railLabel: "Tahap Cutting",
    cutLine: "Garis Potong",
    setStart: "Atur titik awal dan sasaran",
    minimal: "minimal",
    apply: "Terapkan ke yang Belum Diusulkan",
    options: "Pilihan lain",
    words: "Ubah Teks Amplop",
    more: "Tampilkan 20 Lagi",
    envelopes: (d: string) => `Amplop terbuka ${d}, dari acara Pengumuman di Kalender.`,
    cutMark: (lolos: number, gagal: number) =>
      `Garis potong: ${lolos} lolos di atas, ${gagal} gagal di bawah`,
  },
  en: {
    berkasHint:
      "Documents have no score line: the Admin checks decide. Verified ones pass, the rest fail.",
    rail: ["Proposals", "Locked", "Announced"],
    railLabel: "Cutting stage",
    cutLine: "Cut Line",
    setStart: "Set the starting cut and the target",
    minimal: "min",
    apply: "Apply to the Ones Not Yet Proposed",
    options: "More options",
    words: "Edit Envelope Wording",
    more: "Show 20 More",
    envelopes: (d: string) => `Envelopes open ${d}, from the Announcement event in the Calendar.`,
    cutMark: (lolos: number, gagal: number) => `Cut line: ${lolos} pass above, ${gagal} fail below`,
  },
  zh: {
    berkasHint: "材料没有分数线：由管理员的审核决定。已通过审核的通过，其余未通过。",
    rail: ["提议", "已锁定", "已公布"],
    railLabel: "筛选阶段",
    cutLine: "分数线",
    setStart: "设置起始分数线和目标",
    minimal: "最低",
    apply: "应用于尚未提议的人",
    options: "更多选项",
    words: "编辑信封文字",
    more: "再显示 20 位",
    envelopes: (d: string) => `信封于 ${d} 开启，取自日历中的公布活动。`,
    cutMark: (lolos: number, gagal: number) =>
      `分数线：上方 ${lolos} 人通过，下方 ${gagal} 人未通过`,
  },
});
