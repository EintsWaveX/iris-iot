/**
 * The words of Mode Latihan: the bar under the nav, the Ringkasan card and the
 * Account menu entry. Everyday wording, "CaAs" always (plain-english-copy).
 */
import { dict } from "../../lib/app";

export const LAT = dict({
  id: {
    title: "Mode Latihan",
    bar: "Data contoh. Tidak masuk skor dan tidak terlihat kandidat sungguhan.",
    actAs: "Jadi siapa",
    asAsisten: "Sebagai Asisten",
    asCaas: "Sebagai CaAs",
    ulang: "Mulai Ulang",
    samakan: "Samakan dengan Oprec Asli",
    jump: "Lompat Tahap",
    jumpTitle: "Lompat ke Tahap Mana?",
    jumpBody:
      "Latihan mengikuti jadwal sungguhan, jadi tahap yang belum waktunya masih tertutup. Lompat memajukan kalender latihan supaya tahap pilihanmu mulai hari ini, lalu memindahkan semua CaAs contoh ke tahap itu.",
    jumpHint:
      "Berlaku untuk semua Asisten yang sedang berlatih. Samakan dengan Oprec Asli mengembalikan jadwal sungguhan.",
    jumpPick: "Tahap",
    jumpYes: "Lompat",
    leave: "Keluar",
    ulangTitle: "Mulai Ulang Latihan?",
    ulangBody:
      "Semua yang sudah dikerjakan di latihan dihapus: kemajuan CaAs, pilihan jadwal, kehadiran, berkas, ruang tes, jawaban, skor, tim Tubes, dan nilai wawancara. CaAs contoh kembali ke tahap hari ini. Yang kamu atur di latihan tetap ada: kalender, slot, rubrik, pengaturan, dan bank soal.",
    ulangYes: "Mulai Ulang",
    samakanTitle: "Samakan dengan Oprec Asli?",
    samakanBody:
      "Kalender, slot jadwal, rubrik, sesi dan topik Tubes, pengaturan tes, referensi, dan susunan Panitia disalin lagi dari Oprec sungguhan. Kalender kembali ke tanggal asli. CaAs contoh tetap ada, lengkap dengan berkas dan hasilnya. Yang menempel di jadwal lama ikut hilang: kehadiran, pilihan slot, ruang tes, dan nilai wawancara. Bank soal tidak berubah.",
    samakanYes: "Samakan",
    resetHint:
      "Berlaku untuk semua Asisten yang sedang berlatih. Data kandidat sungguhan tidak pernah disalin.",
    cancel: "Batal",
    on: "Aktif",
    off: "Mati",
    cardText:
      "Cermin Oprec sungguhan dengan data contoh. Semua Asisten bisa mencoba semua fitur: jadi Panitia atau jadi CaAs, lalu bertukar kapan saja.",
    statAsisten: "Asisten",
    statCaas: "CaAs contoh",
    statEdition: "edisi Latihan",
    enter: "Masuk Latihan",
    enterMenu: "Masuk Mode Latihan",
    leaveMenu: "Keluar Mode Latihan",
    prepare: "Siapkan Dari Daftar Asisten",
    prepared: (n: number) => `${n} Asisten dari database disiapkan sebagai CaAs contoh.`,
    noEdition: "Belum ada edisi sungguhan, jadi belum ada yang bisa dilatih.",
    failed: "Gagal membuka Mode Latihan. Coba lagi.",
    hidden: "Tombol ini tidak berlaku di Mode Latihan.",
  },
  en: {
    title: "Practice Mode",
    bar: "Sample data. It never counts toward scores and real candidates never see it.",
    actAs: "Act as",
    asAsisten: "As Asisten",
    asCaas: "As CaAs",
    ulang: "Start Over",
    samakan: "Match the Real Oprec",
    jump: "Jump Stage",
    jumpTitle: "Jump to Which Stage?",
    jumpBody:
      "Practice follows the real schedule, so a stage that is not due yet stays closed. Jumping moves the practice calendar so the stage you pick starts today, then puts every sample CaAs on that stage.",
    jumpHint:
      "This applies to every Asisten who is practicing. Match the Real Oprec brings back the real dates.",
    jumpPick: "Stage",
    jumpYes: "Jump",
    leave: "Leave",
    ulangTitle: "Start Practice Over?",
    ulangBody:
      "Everything done in practice is wiped: CaAs progress, schedule picks, attendance, files, exam rooms, answers, scores, Tubes teams and interview scores. The sample CaAs go back to today's stage. What you set up in practice stays: calendar, slots, rubrics, settings and the question bank.",
    ulangYes: "Start Over",
    samakanTitle: "Match the Real Oprec?",
    samakanBody:
      "The calendar, schedule slots, rubrics, Tubes sessions and topics, exam settings, references and the Panitia roster are copied from the real Oprec again. The calendar goes back to the real dates. The sample CaAs stay, with their files and results. Whatever hangs on the old schedule goes too: attendance, slot picks, exam rooms and interview scores. The question bank is unchanged.",
    samakanYes: "Match",
    resetHint:
      "This applies to every Asisten who is practicing. Real candidate data is never copied.",
    cancel: "Cancel",
    on: "On",
    off: "Off",
    cardText:
      "A mirror of the real Oprec with sample data. Every Asisten can try every feature: be Panitia or be a CaAs, and swap at any time.",
    statAsisten: "Asisten",
    statCaas: "sample CaAs",
    statEdition: "Practice edition",
    enter: "Enter Practice",
    enterMenu: "Enter Practice Mode",
    leaveMenu: "Leave Practice Mode",
    prepare: "Prepare From the Asisten List",
    prepared: (n: number) => `${n} Asisten from the database were prepared as sample CaAs.`,
    noEdition: "There is no live edition yet, so there is nothing to practice on.",
    failed: "Couldn't open Practice Mode. Try again.",
    hidden: "This switch does not apply in Practice Mode.",
  },
  zh: {
    title: "练习模式",
    bar: "示例数据，不计入成绩，真正的候选人也看不到。",
    actAs: "扮演",
    asAsisten: "扮演助教",
    asCaas: "扮演候选人",
    ulang: "重新开始",
    samakan: "与正式招募同步",
    jump: "跳到阶段",
    jumpTitle: "跳到哪个阶段？",
    jumpBody:
      "练习按真实日程进行，还没到时间的阶段会保持关闭。跳转会移动练习日历，让你选的阶段从今天开始，并把所有示例 CaAs 放到该阶段。",
    jumpHint: "对所有正在练习的助教都有效。与正式招募同步会恢复真实日期。",
    jumpPick: "阶段",
    jumpYes: "跳转",
    leave: "退出",
    ulangTitle: "重新开始练习？",
    ulangBody:
      "练习中做过的一切都会清除：候选人进度、时间选择、出勤、文件、考场、答案、成绩、Tubes 小组和面试评分。示例候选人回到今天所在的阶段。你在练习中设置的内容会保留：日历、时段、评分标准、设置和题库。",
    ulangYes: "重新开始",
    samakanTitle: "与正式招募同步？",
    samakanBody:
      "日历、时间段、评分标准、Tubes 场次与题目、考试设置、参考资料和委员会名单会再次从正式招募复制过来，日历回到真实日期。示例候选人保留，文件和结果也在。挂在旧日程上的内容会一起消失：出勤、时段选择、考场和面试评分。题库不变。",
    samakanYes: "同步",
    resetHint: "对所有正在练习的助教都有效。真实候选人的数据绝不会被复制。",
    cancel: "取消",
    on: "开",
    off: "关",
    cardText:
      "正式招募的镜像，使用示例数据。每位助教都可以试用所有功能：扮演委员会或候选人，随时切换。",
    statAsisten: "助教",
    statCaas: "示例候选人",
    statEdition: "练习届",
    enter: "进入练习",
    enterMenu: "进入练习模式",
    leaveMenu: "退出练习模式",
    prepare: "用助教名单准备",
    prepared: (n: number) => `已用数据库中的 ${n} 位助教准备为示例 CaAs。`,
    noEdition: "目前没有正式一届，所以没有可练习的内容。",
    failed: "无法打开练习模式，请重试。",
    hidden: "此开关在练习模式中不适用。",
  },
});
