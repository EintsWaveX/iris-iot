/**
 * Words of the Susulan offer: the card on the CaAs page and the Susulan card
 * under the Papan in Plotting (Wawancara and Mengajar). Plain wording, same
 * in the three languages.
 */
import type { Lang } from "../../lib/kelas";
import type { MakeupStage, MakeupState } from "../../lib/recruitment/makeup";

export interface MkWords {
  stage: Record<MakeupStage, string>;
  via: Record<"web" | "line" | "wa" | "telp" | "langsung" | "lain", string>;
  state: Record<MakeupState, string>;
  caas: {
    eyebrow: (stage: string) => string;
    offerTitle: string;
    offerBody: (day: string, from: string, to: string, by: string) => string;
    join: string;
    decline: string;
    askTitle: (stage: string) => string;
    askBody: string;
    askYes: string;
    cancel: string;
    joinedTitle: string;
    joinedBody: string;
    seatTitle: string;
    seatBody: string;
    hours: (a: string, b: string) => string;
    byPanitia: (via: string) => string;
    outTitle: string;
    outDeclined: string;
    outLate: string;
    outBody: string;
    sent: string;
    fail: string;
    late: string;
    done: string;
  };
  papan: {
    title: (stage: string) => string;
    lede: (day: string, from: string, to: string) => string;
    noDay: string;
    due: (when: string) => string;
    toConfirm: (n: number) => string;
    needSeat: (n: number) => string;
    empty: string;
    emptyHint: string;
    absentIn: (room: string, day: string) => string;
    why: Record<string, string>;
    offer: string;
    record: string;
    edit: string;
    reinstate: string;
    place: string;
    release: string;
    retract: string;
    retractTitle: (name: string) => string;
    retractBody: string;
    retractYes: string;
    placeTitle: string;
    placeDesc: (name: string) => string;
    slotLine: (room: string, when: string, taken: number, cap: number) => string;
    noSlots: string;
    trailUnanswered: (when: string) => string;
    trailDeclinedWeb: string;
    trailAnsweredWeb: string;
    trailRecorded: (via: string, by: string) => string;
    dlg: {
      catat: string;
      ubah: string;
      pulihkan: string;
      descRecord: (first: string) => string;
      descReinstate: (name: string, unanswered: boolean) => string;
      who: string;
      answer: string;
      join: string;
      cant: string;
      viaLabel: string;
      noteReq: string;
      noteOpt: string;
      noteReinstate: string;
      noteMin: string;
      logged: string;
      save: string;
      reinstateBtn: string;
      cancel: string;
    };
    toast: {
      offered: (name: string) => string;
      recorded: (name: string) => string;
      reinstated: (name: string) => string;
      placed: (name: string) => string;
      released: (name: string) => string;
      retracted: (name: string) => string;
      fail: string;
      err: Record<string, string>;
    };
  };
}

const ID: MkWords = {
  stage: { wawancara: "Wawancara", mengajar: "Tes Mengajar" },
  via: {
    web: "halamannya",
    line: "LINE",
    wa: "WhatsApp",
    telp: "telepon",
    langsung: "bertemu langsung",
    lain: "cara lain",
  },
  state: {
    tunggu: "Menunggu dikonfirmasi",
    tawar: "Ditawari, belum menjawab",
    ya: "Mau ikut, belum ditempatkan",
    ditempatkan: "Ditempatkan",
    mundur: "Mundur, Gugur",
  },
  caas: {
    eyebrow: (s) => `Susulan ${s}`,
    offerTitle: "Kamu ditawari Susulan",
    offerBody: (day, from, to, by) =>
      `Kamu belum bisa ikut di sesimu. Susulannya ${day}, ${from} sampai ${to} WIB. Panitia akan menempatkanmu dan memberi tahu jamnya di sini. Jawab sebelum ${by}.`,
    join: "Ikut Susulan",
    decline: "Tidak bisa ikut",
    askTitle: (s) => `Mundur dari ${s}?`,
    askBody:
      "Kalau kamu tidak ikut Susulan, perjalananmu berhenti di sini. Kamu tidak bisa membatalkannya sendiri.",
    askYes: "Ya, mundur",
    cancel: "Batal",
    joinedTitle: "Terima kasih, kami menempatkanmu",
    joinedBody: "Jawabanmu diterima. Panitia akan menempatkanmu dan memberi tahu jamnya di sini.",
    seatTitle: "Jadwal Susulanmu",
    seatBody: "Datang tepat waktu dan bawa kartu mahasiswa.",
    hours: (a, b) => `${a} sampai ${b} WIB`,
    byPanitia: (via) => `Panitia mencatat jawabanmu lewat ${via}.`,
    outTitle: "Kamu tidak ikut Susulan",
    outDeclined: "Kamu mundur dari Susulan.",
    outLate: "Batas jawab sudah lewat dan kami belum menerima jawabanmu.",
    outBody:
      "Perjalananmu di tahap ini berhenti. Kalau ini keliru, hubungi Panitia lewat grup LINE.",
    sent: "Jawabanmu terkirim.",
    fail: "Jawabanmu belum terkirim. Coba lagi.",
    late: "Batas jawab sudah lewat. Hubungi Panitia.",
    done: "Kamu sudah menjawab.",
  },
  papan: {
    title: (s) => `Susulan ${s}`,
    lede: (day, from, to) =>
      `${day}, ${from} sampai ${to}. Panitia yang menempatkan. Yang absen ditawari setelah kamu mengonfirmasi alasannya.`,
    noDay:
      "Belum ada hari Susulan di Kalender, jadi belum ada yang bisa ditawari. Tambah acara Susulan dulu.",
    due: (when) =>
      `Jawaban paling lambat ${when} WIB (dari Template). Yang belum menjawab dianggap mundur, tapi kamu bisa mencatat jawaban dari chat atau memulihkannya.`,
    toConfirm: (n) => `${n} menunggu`,
    needSeat: (n) => `${n} perlu tempat`,
    empty: "Tidak ada yang perlu Susulan",
    emptyHint:
      "CaAs yang tidak hadir dan punya izin muncul di sini setelah lembarnya mencatat kasus khusus.",
    absentIn: (room, day) => `Absen di ${room}, ${day}`,
    why: {
      kuliah: "kuliah",
      rohani: "kegiatan rohani",
      sehat: "sakit",
      malang: "musibah",
      keluarga: "keluarga",
      tanpa: "tanpa alasan",
    },
    offer: "Konfirmasi dan Tawarkan",
    record: "Catat Jawaban",
    edit: "Ubah Jawaban",
    reinstate: "Pulihkan",
    place: "Tempatkan",
    release: "Lepas",
    retract: "Tarik Tawaran",
    retractTitle: (n) => `Tarik tawaran Susulan untuk ${n}?`,
    retractBody:
      "Tawaran, jawaban dan kursi Susulannya dihapus; dia kembali seperti sebelum ditawari dan bisa ditawari lagi. Kalau dia sudah melihat tawarannya, kabari dia.",
    retractYes: "Tarik Tawaran",
    placeTitle: "Tempatkan di Susulan",
    placeDesc: (name) => `Pilih slot Susulan untuk ${name}. Dia diberi tahu di halamannya.`,
    slotLine: (room, when, taken, cap) => `${room} · ${when} · ${taken}/${cap}`,
    noSlots: "Belum ada slot di hari Susulan. Buat dulu di tab Slot.",
    trailUnanswered: (when) => `Tidak menjawab sampai ${when}: dianggap mundur.`,
    trailDeclinedWeb: "Menolak di halamannya.",
    trailAnsweredWeb: "Menjawab di halamannya.",
    trailRecorded: (via, by) => `Jawaban lewat ${via}, dicatat ${by}.`,
    dlg: {
      catat: "Catat Jawaban Susulan",
      ubah: "Ubah Jawaban Susulan",
      pulihkan: "Pulihkan CaAs ke Susulan",
      descRecord: (first) =>
        `Untuk CaAs yang menjawab lewat chat atau telepon, bukan lewat halamannya. ${first} ikut diberi tahu di halamannya.`,
      descReinstate: (name, unanswered) =>
        `${name} dianggap mundur ${unanswered ? "karena tidak menjawab sampai batas" : "setelah menolak"}. Memulihkan membuka Susulan lagi untuknya; tulis alasannya supaya tercatat.`,
      who: "Siapa",
      answer: "Jawabannya",
      join: "Ikut Susulan",
      cant: "Tidak bisa",
      viaLabel: "Lewat apa jawabannya masuk",
      noteReq: "Catatan (wajib)",
      noteOpt: "Catatan (boleh kosong)",
      noteReinstate: "Alasan memulihkan (wajib)",
      noteMin: "Tulis paling sedikit 8 karakter.",
      logged: "Tercatat: siapa yang mencatat, kapan, lewat apa, dan catatannya.",
      save: "Simpan Jawaban",
      reinstateBtn: "Pulihkan",
      cancel: "Batal",
    },
    toast: {
      offered: (n) => `Susulan ditawarkan ke ${n}.`,
      recorded: (n) => `Jawaban ${n} dicatat.`,
      reinstated: (n) => `${n} dipulihkan ke Susulan. Dia diberi tahu.`,
      placed: (n) => `${n} ditempatkan di Susulan. Dia diberi tahu.`,
      released: (n) => `${n} dilepas dari Susulan.`,
      retracted: (n) => `Tawaran untuk ${n} ditarik.`,
      fail: "Belum tersimpan. Coba lagi.",
      err: {
        bukan_susulan: "Lembarnya belum mencatat Susulan.",
        tanpa_hari_susulan: "Belum ada hari Susulan di Kalender.",
        sudah_ditawari: "CaAs ini sudah ditawari.",
        belum_ditawari: "CaAs ini belum ditawari.",
        tanpa_kursi: "CaAs ini tidak punya kursi di Susulan.",
        terkunci: "Hasil tahap ini sudah dikunci.",
        edisi_ditutup: "Edisi sudah ditutup.",
        penuh: "Slot itu penuh.",
        data_salah: "Isiannya belum lengkap.",
      },
    },
  },
};

const EN: MkWords = {
  stage: { wawancara: "Interview", mengajar: "Teaching Test" },
  via: {
    web: "their page",
    line: "LINE",
    wa: "WhatsApp",
    telp: "phone call",
    langsung: "in person",
    lain: "another way",
  },
  state: {
    tunggu: "Waiting to be confirmed",
    tawar: "Offered, no answer yet",
    ya: "Wants it, not placed yet",
    ditempatkan: "Placed",
    mundur: "Declined, Gugur",
  },
  caas: {
    eyebrow: (s) => `${s} Makeup`,
    offerTitle: "You're offered the makeup",
    offerBody: (day, from, to, by) =>
      `You couldn't take your session. The makeup is ${day}, ${from} to ${to} WIB. Panitia will place you and tell you the time here. Answer before ${by}.`,
    join: "Join the Makeup",
    decline: "Can't come",
    askTitle: (s) => `Withdraw from the ${s}?`,
    askBody: "If you skip the makeup, your journey stops here. You can't undo this yourself.",
    askYes: "Yes, withdraw",
    cancel: "Cancel",
    joinedTitle: "Thanks, we're placing you",
    joinedBody: "Your answer is in. Panitia will place you and tell you the time here.",
    seatTitle: "Your makeup slot",
    seatBody: "Come on time and bring your student card.",
    hours: (a, b) => `${a} to ${b} WIB`,
    byPanitia: (via) => `Panitia recorded your answer through ${via}.`,
    outTitle: "You're not in the makeup",
    outDeclined: "You withdrew from the makeup.",
    outLate: "The deadline passed and we didn't get an answer from you.",
    outBody:
      "Your journey in this stage stops here. If this is a mistake, talk to Panitia in the LINE group.",
    sent: "Your answer is sent.",
    fail: "Your answer didn't go through. Try again.",
    late: "The deadline passed. Talk to Panitia.",
    done: "You've already answered.",
  },
  papan: {
    title: (s) => `${s} Makeup`,
    lede: (day, from, to) =>
      `${day}, ${from} to ${to}. Panitia place people. An absentee is offered it once you confirm the reason.`,
    noDay:
      "There's no makeup day in the Calendar yet, so nobody can be offered it. Add a makeup event first.",
    due: (when) =>
      `Answers are due ${when} WIB (from the Template). Anyone who hasn't answered counts as withdrawn, but you can record an answer from a chat or reinstate them.`,
    toConfirm: (n) => `${n} to confirm`,
    needSeat: (n) => `${n} need a seat`,
    empty: "Nobody needs the makeup",
    emptyHint:
      "Absentees with a valid reason show up here once their sheet records a special case.",
    absentIn: (room, day) => `Absent in ${room}, ${day}`,
    why: {
      kuliah: "class",
      rohani: "religious event",
      sehat: "ill",
      malang: "misfortune",
      keluarga: "family",
      tanpa: "no reason",
    },
    offer: "Confirm and Offer",
    record: "Record Answer",
    edit: "Edit Answer",
    reinstate: "Reinstate",
    place: "Place",
    release: "Release",
    retract: "Withdraw Offer",
    retractTitle: (n) => `Withdraw the makeup offer for ${n}?`,
    retractBody:
      "Their offer, answer and makeup seat are removed; they go back to how they were before the offer and can be offered again. If they already saw it, tell them.",
    retractYes: "Withdraw Offer",
    placeTitle: "Place in the Makeup",
    placeDesc: (name) => `Pick a makeup slot for ${name}. They're told on their page.`,
    slotLine: (room, when, taken, cap) => `${room} · ${when} · ${taken}/${cap}`,
    noSlots: "There's no slot on the makeup day yet. Make one in the Slot tab first.",
    trailUnanswered: (when) => `Nobody answered by ${when}: counted as withdrawn.`,
    trailDeclinedWeb: "Declined on their page.",
    trailAnsweredWeb: "Answered on their page.",
    trailRecorded: (via, by) => `Answer through ${via}, recorded by ${by}.`,
    dlg: {
      catat: "Record the Makeup Answer",
      ubah: "Edit the Makeup Answer",
      pulihkan: "Reinstate the CaAs for the Makeup",
      descRecord: (first) =>
        `For a CaAs who answered through a chat app or a call instead of their page. ${first} is also told on their page.`,
      descReinstate: (name, unanswered) =>
        `${name} counts as withdrawn ${unanswered ? "because nobody answered by the deadline" : "after declining"}. Reinstating opens the makeup for them again; write why so it is logged.`,
      who: "Who",
      answer: "The answer",
      join: "Joins the Makeup",
      cant: "Can't come",
      viaLabel: "How the answer came in",
      noteReq: "Note (required)",
      noteOpt: "Note (optional)",
      noteReinstate: "Why you reinstate (required)",
      noteMin: "Write at least 8 characters.",
      logged: "Logged: who recorded it, when, through what, and the note.",
      save: "Save the Answer",
      reinstateBtn: "Reinstate",
      cancel: "Cancel",
    },
    toast: {
      offered: (n) => `Makeup offered to ${n}.`,
      recorded: (n) => `${n}'s answer is recorded.`,
      reinstated: (n) => `${n} was reinstated for the makeup. They're told.`,
      placed: (n) => `${n} placed in the makeup. They're told.`,
      released: (n) => `${n} released from the makeup.`,
      retracted: (n) => `The offer to ${n} is withdrawn.`,
      fail: "Not saved. Try again.",
      err: {
        bukan_susulan: "Their sheet doesn't say makeup.",
        tanpa_hari_susulan: "There's no makeup day in the Calendar yet.",
        sudah_ditawari: "This CaAs was already offered.",
        belum_ditawari: "This CaAs wasn't offered yet.",
        tanpa_kursi: "This CaAs has no seat in the makeup.",
        terkunci: "This stage's result is locked.",
        edisi_ditutup: "The edition is closed.",
        penuh: "That slot is full.",
        data_salah: "Something is missing.",
      },
    },
  },
};

const ZH: MkWords = {
  stage: { wawancara: "面试", mengajar: "试讲" },
  via: {
    web: "他们的页面",
    line: "LINE",
    wa: "WhatsApp",
    telp: "电话",
    langsung: "当面",
    lain: "其他方式",
  },
  state: {
    tunggu: "等待确认",
    tawar: "已邀请，未回复",
    ya: "想参加，未安排",
    ditempatkan: "已安排",
    mundur: "已退出，淘汰",
  },
  caas: {
    eyebrow: (s) => `${s}补考`,
    offerTitle: "你获得了补考机会",
    offerBody: (day, from, to, by) =>
      `你没能参加自己的场次。补考在 ${day}，${from} 至 ${to}（WIB）。委员会会为你安排，并在这里告诉你具体时间。请在 ${by} 前回复。`,
    join: "参加补考",
    decline: "无法参加",
    askTitle: (s) => `退出${s}？`,
    askBody: "如果你不参加补考，你的旅程会在这里结束，而且你自己无法撤销。",
    askYes: "是，退出",
    cancel: "取消",
    joinedTitle: "谢谢，我们会为你安排",
    joinedBody: "你的回复已收到。委员会会为你安排，并在这里告诉你时间。",
    seatTitle: "你的补考时段",
    seatBody: "请准时到场，并带上学生证。",
    hours: (a, b) => `${a} 至 ${b}（WIB）`,
    byPanitia: (via) => `委员会已通过${via}记录你的回复。`,
    outTitle: "你不参加补考",
    outDeclined: "你已退出补考。",
    outLate: "回复期限已过，我们没有收到你的回复。",
    outBody: "你在这个阶段的旅程到此结束。如有误会，请在 LINE 群里联系委员会。",
    sent: "你的回复已发送。",
    fail: "回复没有发送成功，请再试一次。",
    late: "回复期限已过，请联系委员会。",
    done: "你已经回复过了。",
  },
  papan: {
    title: (s) => `${s}补考`,
    lede: (day, from, to) =>
      `${day}，${from} 至 ${to}。由委员会安排。缺席的人在你确认原因后会收到邀请。`,
    noDay: "日历里还没有补考日，所以还不能邀请任何人。请先添加补考活动。",
    due: (when) =>
      `回复截止 ${when}（WIB，来自模板）。没回复的人视为退出，但你可以记录聊天里的回复，或恢复他们。`,
    toConfirm: (n) => `${n} 人待确认`,
    needSeat: (n) => `${n} 人需要座位`,
    empty: "没有人需要补考",
    emptyHint: "有正当理由缺席的人，在他们的评分表记录特殊情况后会出现在这里。",
    absentIn: (room, day) => `缺席于 ${room}，${day}`,
    why: {
      kuliah: "上课",
      rohani: "宗教活动",
      sehat: "生病",
      malang: "意外",
      keluarga: "家事",
      tanpa: "没有理由",
    },
    offer: "确认并邀请",
    record: "记录回复",
    edit: "修改回复",
    reinstate: "恢复",
    place: "安排",
    release: "释放",
    retract: "撤回邀请",
    retractTitle: (n) => `撤回对${n}的补考邀请？`,
    retractBody:
      "他们的邀请、回复和补考座位都会被删除，恢复到被邀请之前的样子，之后可以再次邀请。如果他们已经看到了邀请，请告知他们。",
    retractYes: "撤回邀请",
    placeTitle: "安排到补考",
    placeDesc: (name) => `为${name}选择一个补考时段。他们会在自己的页面上收到通知。`,
    slotLine: (room, when, taken, cap) => `${room} · ${when} · ${taken}/${cap}`,
    noSlots: "补考日还没有时段，请先在“时段”标签里创建。",
    trailUnanswered: (when) => `截至 ${when} 无人回复：视为退出。`,
    trailDeclinedWeb: "在自己的页面上拒绝了。",
    trailAnsweredWeb: "在自己的页面上回复了。",
    trailRecorded: (via, by) => `通过${via}回复，由 ${by} 记录。`,
    dlg: {
      catat: "记录补考回复",
      ubah: "修改补考回复",
      pulihkan: "恢复该 CaAs 的补考资格",
      descRecord: (first) =>
        `用于通过聊天软件或电话回复、而不是通过自己页面回复的 CaAs。${first}也会在自己的页面上收到通知。`,
      descReinstate: (name, unanswered) =>
        `${name}被视为退出，${unanswered ? "因为截止前没有回复" : "因为拒绝了"}。恢复后会重新对他们开放补考；请写下原因以便记录。`,
      who: "是谁",
      answer: "回复",
      join: "参加补考",
      cant: "无法参加",
      viaLabel: "回复是怎么收到的",
      noteReq: "备注（必填）",
      noteOpt: "备注（可不填）",
      noteReinstate: "恢复的原因（必填）",
      noteMin: "至少写 8 个字符。",
      logged: "会记录：谁记录的、什么时候、通过什么方式，以及备注。",
      save: "保存回复",
      reinstateBtn: "恢复",
      cancel: "取消",
    },
    toast: {
      offered: (n) => `已向${n}发出补考邀请。`,
      recorded: (n) => `已记录${n}的回复。`,
      reinstated: (n) => `${n}已恢复补考资格，并已通知。`,
      placed: (n) => `${n}已安排到补考，并已通知。`,
      released: (n) => `${n}已从补考中释放。`,
      retracted: (n) => `已撤回对${n}的邀请。`,
      fail: "没有保存成功，请再试一次。",
      err: {
        bukan_susulan: "他们的评分表没有补考记录。",
        tanpa_hari_susulan: "日历里还没有补考日。",
        sudah_ditawari: "这位 CaAs 已经被邀请过了。",
        belum_ditawari: "这位 CaAs 还没有被邀请。",
        tanpa_kursi: "这位 CaAs 在补考里没有座位。",
        terkunci: "这个阶段的结果已锁定。",
        edisi_ditutup: "本届已关闭。",
        penuh: "该时段已满。",
        data_salah: "内容不完整。",
      },
    },
  },
};

export const MK = (lang: Lang): MkWords => (lang === "id" ? ID : lang === "zh" ? ZH : EN);
