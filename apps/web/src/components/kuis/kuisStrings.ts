/**
 * Strings for the Module 4 quiz game (games.irisiotlab.com), 2026-11-13.
 * Indonesian first, then English and Mandarin (Mandarin is off site wide and
 * falls back to English, but the table stays complete). Casual wording, tech
 * words stay in English, Title Case on buttons, no dashes.
 */
import type { Lang } from "../../lib/kelas";

export interface KuisTeks {
  nama: string;
  sub: string;
  /** Pre-flight screens */
  memuat: string;
  belumAdaTitle: string;
  belumAdaSub: string;
  masukDulu: string;
  masukBtn: string;
  bukanSesimuTitle: string;
  bukanSesimuSub: string;
  lihatSajaTitle: string;
  lihatSajaSub: string;
  /** Connection */
  menyambung: string;
  terputus: string;
  sesiSelesai: string;
  dikeluarkan: string;
  penuh: string;
  coba: string;
  /** Lobby, host */
  gabung: string;
  bukaDi: string;
  kodeSesi: string;
  pemainN: (n: number) => string;
  belumAda: string;
  soalDari: string;
  semuaTipe: string;
  tipe: (t: string) => string;
  jumlahSoal: string;
  waktuSoal: string;
  detik: (n: number) => string;
  acak: string;
  mulai: string;
  mulaiSoalN: (n: number) => string;
  perluPemain: string;
  keluarkan: string;
  /** Host in play */
  soalKe: (n: number, total: number) => string;
  terjawabN: (n: number, total: number) => string;
  lewati: string;
  jeda: string;
  lanjutkan: string;
  lanjut: string;
  selesaikan: string;
  mainLagi: string;
  sebaran: string;
  tidakJawab: string;
  penjelasan: string;
  papanTitle: string;
  kelompokTitle: string;
  rataKelompok: (g: number) => string;
  podiumTitle: string;
  juaraN: (n: number) => string;
  skor: string;
  /** Spectating Asisten */
  menonton: (nama: string) => string;
  ambilAlih: string;
  kamuHost: string;
  /** Player */
  kamuMasuk: string;
  lihatLayar: string;
  siap: string;
  terkunci: string;
  tungguYangLain: string;
  benar: string;
  salah: string;
  waktuHabis: string;
  poinN: (n: number) => string;
  streakN: (n: number) => string;
  peringkatN: (n: number, total: number) => string;
  naikN: (n: number) => string;
  turunN: (n: number) => string;
  jawabanBenar: string;
  tipeBenarSalah: string;
  /** Chrome */
  bunyiOn: string;
  bunyiOff: string;
  layarPenuh: string;
  keluar: string;
  bentuk: Record<"segitiga" | "belah-ketupat" | "lingkaran" | "kotak", string>;
  /** Hover tips: the site explains buttons by their label, and these labels mean something else here. */
  tip: Record<
    | "mulai"
    | "lewati"
    | "jeda"
    | "lanjutkan"
    | "lanjut"
    | "selesaikan"
    | "mainLagi"
    | "ambilAlih"
    | "coba",
    string
  >;
  galat: Record<string, string>;
}

export const K: Record<Lang, KuisTeks> = {
  id: {
    nama: "Kuis Modul 4",
    sub: "Tes Awal yang Seru",
    memuat: "Memuat kuis...",
    belumAdaTitle: "Belum Ada Sesi Modul 4",
    belumAdaSub: "Kuis ini cuma jalan waktu sesi Modul 4 berlangsung. Coba lagi nanti ya.",
    masukDulu: "Masuk dulu ya, biar kuisnya tahu kamu siapa.",
    masukBtn: "Masuk",
    bukanSesimuTitle: "Ini Bukan Sesimu",
    bukanSesimuSub: "Masuk lagi dengan kode sesi yang lagi jalan, lalu buka halaman ini lagi.",
    lihatSajaTitle: "Kamu Masuk Cuma Buat Lihat",
    lihatSajaSub: "Untuk main kuis, masuk lagi pakai kode sesi dari layar depan.",
    menyambung: "Menyambung...",
    terputus: "Koneksi putus, menyambung lagi...",
    sesiSelesai: "Sesinya sudah selesai. Makasih sudah main!",
    dikeluarkan: "Kamu dikeluarkan dari kuis ini.",
    penuh: "Kuisnya sudah penuh.",
    coba: "Coba Lagi",
    gabung: "Ayo Gabung!",
    bukaDi: "Buka",
    kodeSesi: "Kode sesi",
    pemainN: (n) => `${n} Pemain`,
    belumAda: "Belum ada yang masuk. Tunggu ya!",
    soalDari: "Soal dari",
    semuaTipe: "Semua Tipe",
    tipe: (t) => `Tipe ${t}`,
    jumlahSoal: "Jumlah Soal",
    waktuSoal: "Waktu Tiap Soal",
    detik: (n) => `${n} detik`,
    acak: "Acak Urutan",
    mulai: "Mulai Kuis",
    mulaiSoalN: (n) => `Mulai (${n} Soal)`,
    perluPemain: "Tunggu minimal satu pemain masuk.",
    keluarkan: "Keluarkan",
    soalKe: (n, total) => `Soal ${n} dari ${total}`,
    terjawabN: (n, total) => `${n} dari ${total} sudah jawab`,
    lewati: "Lewati",
    jeda: "Jeda",
    lanjutkan: "Lanjutkan",
    lanjut: "Lanjut",
    selesaikan: "Selesaikan Kuis",
    mainLagi: "Main Lagi",
    sebaran: "Sebaran jawaban",
    tidakJawab: "Tidak jawab",
    penjelasan: "Penjelasan",
    papanTitle: "Papan Skor",
    kelompokTitle: "Kelompok",
    rataKelompok: (g) => `Kelompok ${g}`,
    podiumTitle: "Juara Kuis",
    juaraN: (n) => `Juara ${n}`,
    skor: "poin",
    menonton: (nama) => `Kamu cuma menonton. ${nama} yang memegang kuis ini.`,
    ambilAlih: "Ambil Alih",
    kamuHost: "Kamu yang memegang kuis ini",
    kamuMasuk: "Kamu sudah masuk!",
    lihatLayar: "Lihat layar depan, kuis segera mulai.",
    siap: "Siap?",
    terkunci: "Jawabanmu Terkunci",
    tungguYangLain: "Tunggu yang lain ya...",
    benar: "Benar!",
    salah: "Salah",
    waktuHabis: "Waktu Habis",
    poinN: (n) => `+${n}`,
    streakN: (n) => `${n} benar berturut-turut`,
    peringkatN: (n, total) => `Peringkat ${n} dari ${total}`,
    naikN: (n) => `Naik ${n}`,
    turunN: (n) => `Turun ${n}`,
    jawabanBenar: "Jawaban yang benar",
    tipeBenarSalah: "Benar atau Salah",
    bunyiOn: "Suara Nyala",
    bunyiOff: "Suara Mati",
    layarPenuh: "Layar Penuh",
    keluar: "Keluar",
    bentuk: {
      segitiga: "segitiga",
      "belah-ketupat": "belah ketupat",
      lingkaran: "lingkaran",
      kotak: "kotak",
    },
    tip: {
      mulai: "Mulai kuis untuk semua pemain.",
      lewati: "Langsung tutup soal ini dan tunjukkan jawabannya.",
      jeda: "Hentikan waktu soal ini sementara.",
      lanjutkan: "Jalankan waktunya lagi.",
      lanjut: "Ke layar berikutnya (bisa juga pakai Spasi).",
      selesaikan: "Akhiri kuis sekarang dan tampilkan juara.",
      mainLagi: "Balik ke lobi dengan pemain yang sama, skor dikosongkan.",
      ambilAlih: "Kamu yang pegang kendali kuis ini.",
      coba: "Sambungkan lagi ke kuis.",
    },
    galat: {
      "fase-salah": "Belum waktunya.",
      terlambat: "Telat, waktunya sudah habis.",
      "sudah-jawab": "Kamu sudah menjawab.",
      "bukan-host": "Cuma yang memegang kuis yang boleh ini.",
      "tanpa-pemain": "Belum ada pemain yang masuk.",
      "bukan-lobi": "Kuisnya sudah jalan.",
      dijeda: "Kuisnya lagi dijeda.",
      penuh: "Kuisnya sudah penuh.",
      "pengaturan-salah": "Pengaturannya tidak valid.",
    },
  },
  en: {
    nama: "Module 4 Quiz",
    sub: "The Fun Pre-Test",
    memuat: "Loading the quiz...",
    belumAdaTitle: "No Module 4 Session Yet",
    belumAdaSub: "This quiz only runs while a Module 4 session is going. Try again later.",
    masukDulu: "Sign in first so the quiz knows who you are.",
    masukBtn: "Sign In",
    bukanSesimuTitle: "This Is Not Your Session",
    bukanSesimuSub:
      "Sign in again with the code of the session that is running, then open this page again.",
    lihatSajaTitle: "You Signed In Just to Look",
    lihatSajaSub: "To play, sign in again with the session code from the front screen.",
    menyambung: "Connecting...",
    terputus: "Connection lost, reconnecting...",
    sesiSelesai: "The session is over. Thanks for playing!",
    dikeluarkan: "You were removed from this quiz.",
    penuh: "The quiz is full.",
    coba: "Try Again",
    gabung: "Join In!",
    bukaDi: "Open",
    kodeSesi: "Session code",
    pemainN: (n) => `${n} ${n === 1 ? "Player" : "Players"}`,
    belumAda: "Nobody is in yet. Hang on!",
    soalDari: "Questions from",
    semuaTipe: "All Types",
    tipe: (t) => `Type ${t}`,
    jumlahSoal: "Number of Questions",
    waktuSoal: "Time Per Question",
    detik: (n) => `${n} seconds`,
    acak: "Shuffle Order",
    mulai: "Start Quiz",
    mulaiSoalN: (n) => `Start (${n} Questions)`,
    perluPemain: "Wait for at least one player to join.",
    keluarkan: "Remove",
    soalKe: (n, total) => `Question ${n} of ${total}`,
    terjawabN: (n, total) => `${n} of ${total} answered`,
    lewati: "Skip",
    jeda: "Pause",
    lanjutkan: "Resume",
    lanjut: "Next",
    selesaikan: "End Quiz",
    mainLagi: "Play Again",
    sebaran: "Answer spread",
    tidakJawab: "No answer",
    penjelasan: "Explanation",
    papanTitle: "Leaderboard",
    kelompokTitle: "Groups",
    rataKelompok: (g) => `Group ${g}`,
    podiumTitle: "Quiz Champions",
    juaraN: (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : "rd"} Place`,
    skor: "pts",
    menonton: (nama) => `You are only watching. ${nama} is running this quiz.`,
    ambilAlih: "Take Over",
    kamuHost: "You are running this quiz",
    kamuMasuk: "You're in!",
    lihatLayar: "Watch the front screen, the quiz starts soon.",
    siap: "Ready?",
    terkunci: "Answer Locked In",
    tungguYangLain: "Waiting for the others...",
    benar: "Correct!",
    salah: "Wrong",
    waktuHabis: "Time's Up",
    poinN: (n) => `+${n}`,
    streakN: (n) => `${n} right in a row`,
    peringkatN: (n, total) => `Rank ${n} of ${total}`,
    naikN: (n) => `Up ${n}`,
    turunN: (n) => `Down ${n}`,
    jawabanBenar: "The right answer",
    tipeBenarSalah: "True or False",
    bunyiOn: "Sound On",
    bunyiOff: "Sound Off",
    layarPenuh: "Full Screen",
    keluar: "Leave",
    bentuk: {
      segitiga: "triangle",
      "belah-ketupat": "diamond",
      lingkaran: "circle",
      kotak: "square",
    },
    tip: {
      mulai: "Starts the quiz for every player.",
      lewati: "Closes this question now and shows the answer.",
      jeda: "Stops this question's clock for a moment.",
      lanjutkan: "Starts the clock again.",
      lanjut: "Goes to the next screen (Space works too).",
      selesaikan: "Ends the quiz now and shows the winners.",
      mainLagi: "Back to the lobby with the same players, scores cleared.",
      ambilAlih: "You take control of this quiz.",
      coba: "Reconnects to the quiz.",
    },
    galat: {
      "fase-salah": "Not yet.",
      terlambat: "Too late, time ran out.",
      "sudah-jawab": "You already answered.",
      "bukan-host": "Only whoever runs the quiz can do that.",
      "tanpa-pemain": "No players have joined yet.",
      "bukan-lobi": "The quiz already started.",
      dijeda: "The quiz is paused.",
      penuh: "The quiz is full.",
      "pengaturan-salah": "Those settings are not valid.",
    },
  },
  zh: {
    nama: "模块 4 测验",
    sub: "好玩的预习测试",
    memuat: "正在加载测验...",
    belumAdaTitle: "还没有模块 4 课程",
    belumAdaSub: "测验只在模块 4 课程进行时开放，请稍后再试。",
    masukDulu: "请先登录，这样测验才知道你是谁。",
    masukBtn: "登录",
    bukanSesimuTitle: "这不是你的课程",
    bukanSesimuSub: "请用正在进行的课程代码重新登录，然后再打开此页面。",
    lihatSajaTitle: "你是以浏览身份登录的",
    lihatSajaSub: "想参加测验，请用前方屏幕上的课程代码重新登录。",
    menyambung: "正在连接...",
    terputus: "连接中断，正在重新连接...",
    sesiSelesai: "课程已结束，谢谢参与！",
    dikeluarkan: "你已被移出本次测验。",
    penuh: "测验人数已满。",
    coba: "重试",
    gabung: "快来加入！",
    bukaDi: "打开",
    kodeSesi: "课程代码",
    pemainN: (n) => `${n} 位玩家`,
    belumAda: "还没有人加入，稍等一下！",
    soalDari: "题目来源",
    semuaTipe: "全部类型",
    tipe: (t) => `类型 ${t}`,
    jumlahSoal: "题目数量",
    waktuSoal: "每题时间",
    detik: (n) => `${n} 秒`,
    acak: "随机顺序",
    mulai: "开始测验",
    mulaiSoalN: (n) => `开始（${n} 题）`,
    perluPemain: "请等至少一位玩家加入。",
    keluarkan: "移出",
    soalKe: (n, total) => `第 ${n} 题，共 ${total} 题`,
    terjawabN: (n, total) => `${n} / ${total} 已作答`,
    lewati: "跳过",
    jeda: "暂停",
    lanjutkan: "继续",
    lanjut: "下一步",
    selesaikan: "结束测验",
    mainLagi: "再玩一次",
    sebaran: "答案分布",
    tidakJawab: "未作答",
    penjelasan: "解析",
    papanTitle: "排行榜",
    kelompokTitle: "小组",
    rataKelompok: (g) => `第 ${g} 组`,
    podiumTitle: "测验冠军",
    juaraN: (n) => `第 ${n} 名`,
    skor: "分",
    menonton: (nama) => `你只是观看。${nama} 正在主持本次测验。`,
    ambilAlih: "接管",
    kamuHost: "你正在主持本次测验",
    kamuMasuk: "你已加入！",
    lihatLayar: "请看前方屏幕，测验马上开始。",
    siap: "准备好了吗？",
    terkunci: "答案已锁定",
    tungguYangLain: "等待其他人...",
    benar: "答对了！",
    salah: "答错了",
    waktuHabis: "时间到",
    poinN: (n) => `+${n}`,
    streakN: (n) => `连续答对 ${n} 题`,
    peringkatN: (n, total) => `第 ${n} 名，共 ${total} 人`,
    naikN: (n) => `上升 ${n}`,
    turunN: (n) => `下降 ${n}`,
    jawabanBenar: "正确答案",
    tipeBenarSalah: "判断题",
    bunyiOn: "声音开",
    bunyiOff: "声音关",
    layarPenuh: "全屏",
    keluar: "离开",
    bentuk: { segitiga: "三角形", "belah-ketupat": "菱形", lingkaran: "圆形", kotak: "方形" },
    tip: {
      mulai: "为所有玩家开始测验。",
      lewati: "立即结束本题并显示答案。",
      jeda: "暂时停止本题计时。",
      lanjutkan: "重新开始计时。",
      lanjut: "进入下一个画面（也可按空格键）。",
      selesaikan: "立即结束测验并显示冠军。",
      mainLagi: "用同一批玩家回到大厅，分数清零。",
      ambilAlih: "由你来控制本次测验。",
      coba: "重新连接测验。",
    },
    galat: {
      "fase-salah": "还没到时候。",
      terlambat: "太晚了，时间已到。",
      "sudah-jawab": "你已经作答了。",
      "bukan-host": "只有主持人才能这样做。",
      "tanpa-pemain": "还没有玩家加入。",
      "bukan-lobi": "测验已经开始。",
      dijeda: "测验已暂停。",
      penuh: "测验人数已满。",
      "pengaturan-salah": "设置无效。",
    },
  },
};
