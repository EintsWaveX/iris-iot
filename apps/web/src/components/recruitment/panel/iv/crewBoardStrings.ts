import type { Lang } from "../../../../lib/kelas";

/** The words of the Plotting board's examiner pieces (the Penguji card, the lane in each slot, the toasts). */
export interface CrewBoardWords {
  poolTitle: string;
  poolHint: (per: number, panel: boolean) => string;
  poolHintPhone: string;
  poolAll: (n: number) => string;
  laneBooth: string;
  lanePanel: string;
  empty: string;
  show: string;
  remove: (code: string) => string;
  add: (room: string, when: string) => string;
  undo: string;
  removed: (code: string, room: string, when: string) => string;
  already: (code: string, panel: boolean) => string;
  clashNow: (code: string, room: string, panel: boolean) => string;
  added: (code: string, room: string, when: string) => string;
  to: string;
  twoSlots: (nama: string) => string;
  twoAt: (
    where: string,
    at: string,
    stage: string,
    from: string,
    to: string,
    room: string,
  ) => string;
  clashTip: (stage: string, from: string, to: string, room: string) => string;
  xlsx: string;
  xlsxDone: (name: string) => string;
}

const ID: CrewBoardWords = {
  poolTitle: "Penguji",
  poolHint: (per, panel) =>
    panel
      ? `Seret ke baris Panel sebuah ruang. ${per} orang menguji seluruh malam, jadi mereka melihat semua kandidat di ruang itu. Angkanya jumlah malam orang itu.`
      : `Seret ke baris Penguji sebuah ruang. Beberapa orang untuk tiap bilik (bawaan dua), berurutan: dua nama pertama untuk kandidat pertama. Angkanya jumlah slot orang itu.`,
  poolHintPhone: "Di HP, pakai tombol tambah di baris tiap ruang.",
  poolAll: (n) => `Semua Asisten aktif (${n})`,
  laneBooth: "Penguji",
  lanePanel: "Panel",
  empty: "kosong",
  show: "Lihat",
  remove: (c) => `Lepas ${c}`,
  add: (room, when) => `Tambah penguji ${room}, ${when}`,
  undo: "Urungkan",
  removed: (c, room, when) => `${c} dilepas dari ${room}, ${when}.`,
  already: (c, panel) => `${c} sudah menguji ${panel ? "ruang" : "slot"} ini.`,
  clashNow: (c, room, panel) =>
    `${c} sekarang bentrok: dia juga di ${room} ${panel ? "malam" : "jam"} ini. Tetap tersimpan dan ditandai merah.`,
  added: (c, room, when) => `${c} menguji ${room}, ${when}. Dia diberi tahu.`,
  to: "sampai",
  twoSlots: (n) => `${n} punya dua jadwal`,
  twoAt: (w, at, st, a, b, r) => `${w} pukul ${at}, dan ${st} ${a} sampai ${b} di ${r}`,
  clashTip: (stage, from, to, room) => `Bentrok: ${stage}, ${from} sampai ${to}, ${room}`,
  xlsx: "Download XLSX",
  xlsxDone: (n) => `${n}.xlsx sudah didownload.`,
};

const EN: CrewBoardWords = {
  poolTitle: "Examiners",
  poolHint: (per, panel) =>
    panel
      ? `Drag onto a room's Panel row. ${per} people sit the whole evening, so they see every candidate in that room. The number is how many evenings that person has.`
      : `Drag onto a room's Examiners row. A few people for each booth (two by default), in order: the first two names go with the first candidate. The number is how many slots that person has.`,
  poolHintPhone: "On a phone, use the add button in each room's row.",
  poolAll: (n) => `Every active Asisten (${n})`,
  laneBooth: "Examiners",
  lanePanel: "Panel",
  empty: "empty",
  show: "Show",
  remove: (c) => `Remove ${c}`,
  add: (room, when) => `Add an examiner to ${room}, ${when}`,
  undo: "Undo",
  removed: (c, room, when) => `${c} removed from ${room}, ${when}.`,
  already: (c, panel) => `${c} already examines this ${panel ? "room" : "slot"}.`,
  clashNow: (c, room, panel) =>
    `${c} now clashes: they're also in ${room} ${panel ? "this evening" : "at this time"}. Saved, and marked red.`,
  added: (c, room, when) => `${c} examines ${room}, ${when}. They're told.`,
  to: "to",
  twoSlots: (n) => `${n} has two slots at the same time`,
  twoAt: (w, at, st, a, b, r) => `${w} at ${at}, and ${st} ${a} to ${b} in ${r}`,
  clashTip: (stage, from, to, room) => `Clash: ${stage}, ${from} to ${to}, ${room}`,
  xlsx: "Download XLSX",
  xlsxDone: (n) => `${n}.xlsx downloaded.`,
};

const ZH: CrewBoardWords = {
  poolTitle: "考官",
  poolHint: (per, panel) =>
    panel
      ? `拖到某个教室的评审组一行。${per} 人整晚都在，所以会看到这个教室的所有候选人。数字是这个人负责的晚数。`
      : `拖到某个教室的考官一行。每个面试间安排几个人（默认两个），按顺序：前两个芯片对应第一位候选人。数字是这个人负责的时段数。`,
  poolHintPhone: "在手机上，请用每个教室一行里的添加按钮。",
  poolAll: (n) => `所有在职助教（${n}）`,
  laneBooth: "考官",
  lanePanel: "评审组",
  empty: "空",
  show: "查看",
  remove: (c) => `移除 ${c}`,
  add: (room, when) => `给 ${room}（${when}）添加考官`,
  undo: "撤销",
  removed: (c, room, when) => `${c} 已从 ${room}（${when}）移除。`,
  already: (c, panel) => `${c} 已经在这个${panel ? "教室" : "时段"}了。`,
  clashNow: (c, room, panel) =>
    `${c} 现在冲突了：${panel ? "这晚" : "这个时间"}还在 ${room}。已保存并标红。`,
  added: (c, room, when) => `${c} 负责 ${room}（${when}），已通知。`,
  to: "至",
  twoSlots: (n) => `${n} 同时有两个时段`,
  twoAt: (w, at, st, a, b, r) => `${w} ${at}，以及${st} ${a} 至 ${b}（${r}）`,
  clashTip: (stage, from, to, room) => `冲突：${stage}，${from} 至 ${to}，${room}`,
  xlsx: "下载 XLSX",
  xlsxDone: (n) => `${n}.xlsx 已下载。`,
};

export const CB = (lang: Lang): CrewBoardWords => (lang === "id" ? ID : lang === "zh" ? ZH : EN);
