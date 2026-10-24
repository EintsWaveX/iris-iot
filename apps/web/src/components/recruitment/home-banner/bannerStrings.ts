/** The Home recruitment banner's words (prompt 03), one set of lines per viewer. */
import { dict } from "../../../lib/app";

export const BN = dict({
  id: {
    label: "Open Recruitment Asisten IRIS 2026",
    visitor: {
      title: "Mau jadi Asisten IRIS berikutnya?",
      hint: (a: string, b: string) =>
        `Pendaftaran ${a} sampai ${b} untuk Praktikan semester ini. Masuk dengan akun Praktikan untuk mendaftar.`,
      soon: (a: string) =>
        `Pendaftaran dibuka ${a} untuk Praktikan semester ini. Masuk dengan akun Praktikan untuk mendaftar.`,
      stages: "Lihat Tahapan",
      signIn: "Masuk",
    },
    praktikan: {
      title: "Pendaftaran Asisten sedang dibuka",
      hint: (d: string, jam: string) =>
        `Tutup ${d} pukul ${jam} WIB. Siapkan CV, surat lamaran dan visi misi dalam PDF.`,
      closesIn: "Tutup dalam",
      closesAria: "Pendaftaran tutup dalam",
      stages: "Lihat Tahapan",
      apply: "Daftar",
    },
    candidate: {
      applied: "Berkasmu sedang diperiksa",
      revision: "Admin meminta perbaikan berkasmu",
      stage: (s: string) => `Tahapmu sekarang: ${s}`,
      accepted: "Selamat, kamu diterima jadi Asisten IRIS",
      next: (t: string, when: string) => `Berikutnya: ${t}, ${when}.`,
      nothing: "Belum ada acara berikutnya. Kabarnya muncul di sini.",
      envelope: "Ada amplop tersegel menunggumu",
      sealedChip: "Amplop Tersegel",
      open: "Buka Rekrutmen",
      fix: "Perbaiki Berkas",
      stages: "Tahapan",
    },
    cut: {
      title: (s: string) => `Terima kasih sudah ikut sampai ${s}`,
      hint: "Perjalananmu tetap bisa kamu lihat. Pesan ini hilang dari Beranda seminggu setelah pengumuman.",
      journey: "Lihat Perjalananku",
    },
    panitia: {
      title: (seat: string) => (seat ? `Panitia ${seat}` : "Panitia Open Recruitment"),
      today: (names: string) => `Hari ini: ${names}.`,
      none: "Hari ini tidak ada acara rekrutmen.",
      applicants: "pendaftar",
      waiting: "menunggu verifikasi",
      panel: "Buka Panel",
    },
    asisten: {
      title: "Open Recruitment sedang berjalan",
      today: (names: string) => `Hari ini: ${names}.`,
      calendar: "Lihat Kalender",
    },
  },
  en: {
    label: "IRIS Asisten Open Recruitment 2026",
    visitor: {
      title: "Want to be the next IRIS Asisten?",
      hint: (a: string, b: string) =>
        `Registration runs ${a} to ${b} for this semester's Praktikan. Sign in with your Praktikan account to apply.`,
      soon: (a: string) =>
        `Registration opens ${a} for this semester's Praktikan. Sign in with your Praktikan account to apply.`,
      stages: "See the Stages",
      signIn: "Sign In",
    },
    praktikan: {
      title: "Asisten registration is open",
      hint: (d: string, jam: string) =>
        `Closes ${d} at ${jam} WIB. Have your CV, cover letter and vision statement ready as PDFs.`,
      closesIn: "Closes in",
      closesAria: "Registration closes in",
      stages: "See the Stages",
      apply: "Apply",
    },
    candidate: {
      applied: "Your documents are being checked",
      revision: "Admin asked for a fix to your documents",
      stage: (s: string) => `Your stage now: ${s}`,
      accepted: "Congratulations, you're an IRIS Asisten",
      next: (t: string, when: string) => `Next: ${t}, ${when}.`,
      nothing: "Nothing is scheduled next yet. The news shows up here.",
      envelope: "A sealed envelope is waiting for you",
      sealedChip: "Sealed Envelope",
      open: "Open Recruitment",
      fix: "Fix My Documents",
      stages: "Stages",
    },
    cut: {
      title: (s: string) => `Thank you for coming as far as ${s}`,
      hint: "You can still look back at your journey. This note leaves Home a week after the announcement.",
      journey: "See My Journey",
    },
    panitia: {
      title: (seat: string) => (seat ? `${seat} Panitia` : "Open Recruitment Panitia"),
      today: (names: string) => `Today: ${names}.`,
      none: "No recruitment events today.",
      applicants: "applicants",
      waiting: "awaiting checks",
      panel: "Open Panel",
    },
    asisten: {
      title: "Open Recruitment is running",
      today: (names: string) => `Today: ${names}.`,
      calendar: "See the Calendar",
    },
  },
  zh: {
    label: "IRIS 助教招募 2026",
    visitor: {
      title: "想成为下一位 IRIS 助教吗？",
      hint: (a: string, b: string) =>
        `本学期的学生可以在 ${a} 到 ${b} 报名。用学生账号登录就能报名。`,
      soon: (a: string) => `本学期的学生可以从 ${a} 开始报名。用学生账号登录就能报名。`,
      stages: "查看各阶段",
      signIn: "登录",
    },
    praktikan: {
      title: "助教报名已开放",
      hint: (d: string, jam: string) =>
        `${d} ${jam}（WIB）截止。请把简历、申请信和愿景说明准备成 PDF。`,
      closesIn: "距截止还有",
      closesAria: "距报名截止还有",
      stages: "查看各阶段",
      apply: "报名",
    },
    candidate: {
      applied: "你的材料正在审核",
      revision: "管理员请你修改材料",
      stage: (s: string) => `你现在的阶段：${s}`,
      accepted: "恭喜，你成为了 IRIS 助教",
      next: (t: string, when: string) => `接下来：${t}，${when}。`,
      nothing: "接下来还没有安排。消息会出现在这里。",
      envelope: "有一封密封的信在等你",
      sealedChip: "未拆信封",
      open: "打开招募",
      fix: "修改材料",
      stages: "各阶段",
    },
    cut: {
      title: (s: string) => `谢谢你一路走到${s}`,
      hint: "你仍然可以回看自己的历程。这条消息会在公布结果一周后从首页消失。",
      journey: "查看我的历程",
    },
    panitia: {
      title: (seat: string) => (seat ? `${seat}招募组` : "助教招募组"),
      today: (names: string) => `今天：${names}。`,
      none: "今天没有招募活动。",
      applicants: "位报名者",
      waiting: "待审核",
      panel: "打开面板",
    },
    asisten: {
      title: "助教招募正在进行",
      today: (names: string) => `今天：${names}。`,
      calendar: "查看日程",
    },
  },
});
