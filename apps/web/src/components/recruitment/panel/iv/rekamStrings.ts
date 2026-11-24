import { dict } from "../../../../lib/app";

/** The words of the Wawancara voice recording: the recorder on the sheet and the player in Penilaian. */
export interface RekamWords {
  start: string;
  stop: string;
  asking: string;
  recording: (time: string) => string;
  saved: (n: number) => string;
  uploading: (n: number) => string;
  failed: (n: number) => string;
  retry: string;
  download: string;
  denied: string;
  unsupported: string;
  hint: string;
  leave: string;
  title: string;
  none: string;
  total: (n: number, time: string) => string;
  part: (n: number) => string;
  by: (code: string) => string;
  loadFail: string;
}

export const RK = dict<RekamWords>({
  id: {
    start: "Mulai rekam suara",
    stop: "Berhenti",
    asking: "Menunggu izin mikrofon…",
    recording: (t) => `Merekam ${t}`,
    saved: (n) => `${n} bagian tersimpan`,
    uploading: (n) => `Mengirim ${n} bagian…`,
    failed: (n) => `${n} bagian belum terkirim`,
    retry: "Kirim ulang",
    download: "Simpan ke perangkat",
    denied:
      "Mikrofon tidak diizinkan. Izinkan mikrofon untuk situs ini di pengaturan peramban, lalu coba lagi.",
    unsupported:
      "Peramban ini tidak bisa merekam. Pakai Chrome, Edge, Firefox atau Safari terbaru, atau rekam di perangkat lain dan nyalakan penanda.",
    hint: "Rekaman dipotong tiap 5 menit dan dikirim otomatis. Biarkan halaman ini terbuka dan layar menyala sampai wawancara selesai.",
    leave: "Rekaman masih berjalan atau belum terkirim. Tetap tinggalkan halaman?",
    title: "Rekaman suara",
    none: "Belum ada rekaman untuk CaAs ini.",
    total: (n, t) => `${n} bagian, ${t}`,
    part: (n) => `Bagian ${n}`,
    by: (c) => `direkam ${c}`,
    loadFail: "Rekaman belum bisa dimuat. Coba lagi.",
  },
  en: {
    start: "Start voice recording",
    stop: "Stop",
    asking: "Waiting for microphone permission…",
    recording: (t) => `Recording ${t}`,
    saved: (n) => `${n} part${n === 1 ? "" : "s"} saved`,
    uploading: (n) => `Sending ${n} part${n === 1 ? "" : "s"}…`,
    failed: (n) => `${n} part${n === 1 ? "" : "s"} not sent`,
    retry: "Send again",
    download: "Save to this device",
    denied:
      "The microphone is blocked. Allow it for this site in the browser settings, then try again.",
    unsupported:
      "This browser cannot record. Use a recent Chrome, Edge, Firefox or Safari, or record on another device and turn the marker on.",
    hint: "The recording is cut every 5 minutes and sent on its own. Keep this page open and the screen on until the interview is over.",
    leave: "The recording is still running or not yet sent. Leave the page anyway?",
    title: "Voice recording",
    none: "No recording for this CaAs yet.",
    total: (n, t) => `${n} part${n === 1 ? "" : "s"}, ${t}`,
    part: (n) => `Part ${n}`,
    by: (c) => `recorded by ${c}`,
    loadFail: "The recording could not be loaded. Try again.",
  },
  zh: {
    start: "开始录音",
    stop: "停止",
    asking: "等待麦克风权限…",
    recording: (t) => `录音中 ${t}`,
    saved: (n) => `已保存 ${n} 段`,
    uploading: (n) => `正在上传 ${n} 段…`,
    failed: (n) => `${n} 段未上传`,
    retry: "重新上传",
    download: "保存到本机",
    denied: "麦克风被禁用。请在浏览器设置中允许本站使用麦克风，然后重试。",
    unsupported:
      "此浏览器无法录音。请使用最新版 Chrome、Edge、Firefox 或 Safari，或在其他设备上录音并打开标记。",
    hint: "录音每 5 分钟切分并自动上传。面试结束前请保持页面打开、屏幕常亮。",
    leave: "录音仍在进行或尚未上传。仍要离开页面吗？",
    title: "面试录音",
    none: "此 CaAs 还没有录音。",
    total: (n, t) => `${n} 段，${t}`,
    part: (n) => `第 ${n} 段`,
    by: (c) => `由 ${c} 录制`,
    loadFail: "无法加载录音，请重试。",
  },
});
