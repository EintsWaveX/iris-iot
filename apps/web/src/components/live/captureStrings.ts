/** Words for journal captures and the laptop mirror (Phase 9 Stage 7f). */
import { dict } from "../../lib/app";

export const CV = dict({
  id: {
    capture: "Tangkap 5 Data Terakhir",
    captureShort: "Tangkap 5 Data",
    title: "Tangkapan untuk Jurnal",
    desc: (m: number) => `Sama persis dengan tabel di jurnal Modul ${m}.`,
    taken: (at: string, n: number) =>
      n >= 5
        ? `Diambil ${at} · 5 data terakhir yang lengkap`
        : `Diambil ${at} · baru ${n} data lengkap`,
    none: "Belum ada data lengkap. Tunggu sampai pesan pertama sampai, lalu tangkap lagi.",
    tabPacket: "Tabel Paket",
    tabDist: "Tabel Jarak",
    copy: "Salin, siap ditempel ke tabel",
    csv: "Unduh CSV",
    copied: "Tersalin. Tempel ke Word atau Sheets.",
    copyFail: "Tidak bisa menyalin ke papan klip.",
    again: "Tangkap Ulang",
    againDone: "Ditangkap ulang.",
    close: "Tutup",
    save: "Simpan ke Jurnal",
    saving: "Menyimpan…",
    saved: "Tersimpan di jurnalmu.",
    noSession: "Sesi modul ini belum berjalan, jadi tangkapan belum bisa disimpan.",
    failed: "Gagal menyimpan. Coba lagi.",
    mark: (pos: string) => `Tandai ${pos}`,
    nowHalus: (h: number | null, e: number | null) =>
      h === null
        ? "Belum ada RSSI halus dari Hunter."
        : `RSSI halus sekarang ${h} dBm, perkiraan ${e ?? "-"} m.`,
    distHint: "Isi jarak dari meteran dan ada tidaknya penghalang.",
    savedCount: (n: number) => (n ? `${n} tangkapan tersimpan` : "Belum ada tangkapan"),
    listTitle: "Tangkapan untuk Jurnal",
    listEmpty: "Belum ada tangkapan yang disimpan untuk modul ini.",
    savedAt: (at: string) => `Disimpan ${at}`,
    by: (n: string) => `oleh ${n}`,
    mirror: "Cermin Laptop",
    mirrorNote:
      "Baris mentah yang diteruskan laptop kelompok ke server, persis seperti yang mereka lihat. Berguna saat kamu tidak di meja mereka.",
    mirrorEmpty:
      "Laptop kelompok ini belum meneruskan baris. Baris muncul begitu papannya tersambung.",
  },
  en: {
    capture: "Capture the Last 5",
    captureShort: "Capture 5",
    title: "Capture for the Journal",
    desc: (m: number) => `Matches the table in the Module ${m} journal exactly.`,
    taken: (at: string, n: number) =>
      n >= 5
        ? `Taken at ${at} · last 5 complete records`
        : `Taken at ${at} · only ${n} complete so far`,
    none: "No complete records yet. Wait for the first message to arrive, then capture again.",
    tabPacket: "Packet Table",
    tabDist: "Distance Table",
    copy: "Copy, ready to paste into a table",
    csv: "Download CSV",
    copied: "Copied. Paste it into Word or Sheets.",
    copyFail: "Couldn't copy to the clipboard.",
    again: "Capture Again",
    againDone: "Captured again.",
    close: "Close",
    save: "Save to Journal",
    saving: "Saving…",
    saved: "Saved to your journal.",
    noSession: "This module's session isn't running, so captures can't be saved yet.",
    failed: "Couldn't save. Try again.",
    mark: (pos: string) => `Mark ${pos}`,
    nowHalus: (h: number | null, e: number | null) =>
      h === null
        ? "No smoothed RSSI from the Hunter yet."
        : `Smoothed RSSI now ${h} dBm, estimate ${e ?? "-"} m.`,
    distHint: "Type the distance from the tape and whether anything was in the way.",
    savedCount: (n: number) =>
      n ? `${n} ${n === 1 ? "capture" : "captures"} saved` : "No captures yet",
    listTitle: "Journal Captures",
    listEmpty: "No captures saved for this module yet.",
    savedAt: (at: string) => `Saved ${at}`,
    by: (n: string) => `by ${n}`,
    mirror: "Laptop Mirror",
    mirrorNote:
      "Raw lines the group's laptop forwards to the server, exactly as they see them. Handy when you aren't at their desk.",
    mirrorEmpty:
      "This group's laptop hasn't forwarded any lines yet. They show up once its boards connect.",
  },
  zh: {
    capture: "采集最后 5 条",
    captureShort: "采集 5 条",
    title: "日志采集",
    desc: (m: number) => `与模块 ${m} 日志里的表格完全一致。`,
    taken: (at: string, n: number) =>
      n >= 5 ? `采集于 ${at} · 最后 5 条完整记录` : `采集于 ${at} · 目前只有 ${n} 条完整`,
    none: "还没有完整的记录。等第一条消息到达后再采集。",
    tabPacket: "数据包表",
    tabDist: "距离表",
    copy: "复制，可直接粘贴到表格",
    csv: "下载 CSV",
    copied: "已复制。粘贴到 Word 或 Sheets 即可。",
    copyFail: "无法复制到剪贴板。",
    again: "重新采集",
    againDone: "已重新采集。",
    close: "关闭",
    save: "保存到日志",
    saving: "正在保存…",
    saved: "已保存到你的日志。",
    noSession: "这个模块的实验课还没开始，暂时不能保存采集。",
    failed: "保存失败，请再试一次。",
    mark: (pos: string) => `标记 ${pos}`,
    nowHalus: (h: number | null, e: number | null) =>
      h === null ? "Hunter 还没有平滑 RSSI。" : `当前平滑 RSSI ${h} dBm，估计 ${e ?? "-"} m。`,
    distHint: "填入卷尺量到的距离，以及中间有没有障碍物。",
    savedCount: (n: number) => (n ? `已保存 ${n} 次采集` : "还没有采集"),
    listTitle: "日志采集",
    listEmpty: "这个模块还没有保存的采集。",
    savedAt: (at: string) => `保存于 ${at}`,
    by: (n: string) => `由 ${n}`,
    mirror: "笔记本镜像",
    mirrorNote: "小组笔记本转发到服务器的原始行，和他们看到的一模一样。你不在他们桌边时很有用。",
    mirrorEmpty: "这个小组的笔记本还没有转发任何行。板子连上后就会出现。",
  },
});
