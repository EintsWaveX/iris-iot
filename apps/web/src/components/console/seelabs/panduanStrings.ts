/** The SeeLabs guide's words (2026-10-09): from scoring in IRIS to Simpan
 *  Penilaian in SeeLabs, one step at a time. SeeLabs' own labels stay as
 *  SeeLabs writes them in every language. No dashes in copy. */
import { dict } from "../../../lib/app";

export interface LangkahPanduan {
  judul: string;
  isi: string[];
  /** Where the step's button goes, if it has one. */
  aksi?: {
    label: string;
    ke: "pasang" | "tabel" | "salin" | "cara" | "tidak" | "titipan" | "seelabs" | "akun";
  };
}

export const PANDUAN_SEELABS_URL = "https://athena.ptrkr.moe/asisten/input/nilai";

export const PD = dict({
  id: {
    tab: "Panduan",
    btn: "Panduan SeeLabs",
    title: "Panduan Nilai ke SeeLabs",
    sub: "Dari mengisi nilai di IRIS sampai Simpan Penilaian di SeeLabs. Buka lagi kapan saja dari tab ini.",
    step: (n: number, total: number) => `Langkah ${n} dari ${total}`,
    prev: "Sebelumnya",
    next: "Berikutnya",
    done: "Selesai",
    restart: "Ulangi dari Awal",
    finished: "Kamu sudah melihat semua langkah. Buka lagi kapan saja dari tab Panduan.",
    flow: [
      "Isi nilai",
      "Kirim Nilai",
      "Salin",
      "Isi SeeLabs",
      "Simpan Penilaian",
      "Tandai Disimpan",
    ],
    legendTitle: "Delapan komponen, urutan sama dengan SeeLabs",
    legend: [
      ["TP", "Tugas Pendahuluan"],
      ["TA", "Tugas Awal"],
      ["D1", "Aktif Merakit Komponen/Software"],
      ["D2", "Aktif Mengoperasikan Alat"],
      ["D3", "Aktif Berdiskusi Dalam Kelompok"],
      ["D4", "Aktif Merancang Aplikasi/Analisis"],
      ["L1", "Jurnal Praktikum"],
      ["L2", "Analisa Hasil Praktikum"],
    ] as [string, string][],
    langkah: [
      {
        judul: "Gambaran Alurnya",
        isi: [
          "Nilai diisi sekali di IRIS. SeeLabs tidak punya API, jadi IRIS tidak pernah masuk ke SeeLabs untukmu.",
          "Bookmarklet IRIS · Isi SeeLabs mengisi form di tab SeeLabs milikmu sendiri. Tombol Simpan Penilaian tetap kamu yang menekan.",
          "Urutannya: isi nilai, Kirim Nilai, salin, isi SeeLabs, Simpan Penilaian, lalu tandai Sudah Disimpan di IRIS.",
        ],
      },
      {
        judul: "Sekali Saja: Pasang Bookmarklet",
        isi: [
          "Buka tab Bookmarklet, lalu seret tombol IRIS · Isi SeeLabs ke bilah bookmark browser. Jangan diklik di halaman IRIS.",
          "Bilah bookmark tidak tampak? Tekan Ctrl+Shift+B (Cmd+Shift+B di Mac).",
          "Isi juga nama akun SeeLabs-mu di halaman Akun, supaya kelompok yang memakai akunmu tercatat benar. Kata sandi tidak pernah disimpan.",
        ],
        aksi: { label: "Buka Tab Bookmarklet", ke: "pasang" },
      },
      {
        judul: "Isi Nilai di IRIS",
        isi: [
          "Isi lewat inspektur kelompok di papan, atau lewat Tabel Nilai untuk banyak sekaligus. Enter pindah ke bawah seperti spreadsheet.",
          "Per Orang mengisi satu Praktikan. Sama Rata mengisi kolom itu untuk semua anggota yang hadir.",
          "Praktikan yang tidak datang: nyalakan Tidak Hadir. Semua kolomnya jadi 0 dan dilewati Sama Rata.",
          "Hanya pemegang kelompok yang bisa mengisi. Kelompok yang dipegang asisten lain tampil Hanya Lihat.",
        ],
        aksi: { label: "Buka Tabel Nilai", ke: "tabel" },
      },
      {
        judul: "Kirim Nilai",
        isi: [
          "Begitu semua anggota lengkap delapan kolomnya, tekan Kirim Nilai di kelompok itu. Selama masih ada kolom kosong, tombolnya menyebut berapa yang kurang.",
          "Setelah dikirim, tiap Praktikan bisa melihat nilainya sendiri di Dasbor, bukan nilai temannya.",
          "Unit bayarmu untuk kelompok itu baru tercatat setelah Kirim Nilai dan setelah sesi diakhiri: Rp 32.500 untuk Reguler, Rp 65.000 untuk Internasional.",
          "Perubahan nilai setelah dikirim tetap boleh dan langsung terlihat oleh Praktikan.",
        ],
        aksi: { label: "Buka Tabel Nilai", ke: "tabel" },
      },
      {
        judul: "Pastikan Akun SeeLabs-nya",
        isi: [
          "Kelompok pertamamu dikirim lewat akun SeeLabs-mu sendiri.",
          "Pegang dua kelompok? SeeLabs hanya membayar satu akun per sesi, jadi kelompok kedua dikirim lewat akun asisten lain yang tidak mengajar di slot itu. Pilih akunnya di inspektur kelompok.",
          "Akun itu harus sudah mencentang shift-nya di SeeLabs Input Jaga (paling banyak 2 shift sehari). Kalau belum, KLP-nya tidak muncul tanpa token.",
          "Akunmu dipinjam orang lain? Kelompoknya muncul di tab Titipan.",
        ],
        aksi: { label: "Buka Tab Titipan", ke: "titipan" },
      },
      {
        judul: "Buka Form SeeLabs",
        isi: [
          "Di tab browser sendiri, masuk ke SeeLabs Asisten, lalu Nilai Praktikum › Input Nilai.",
          "Pilih praktikumnya: Pemrograman Perangkat IoT TE untuk Reguler, atau yang INT untuk Internasional.",
          "Cari nomor KLP kelompokmu di Daftar Kelompok Jaga Hari Ini, lalu tekan Input Nilai. Nomor KLP-nya tertulis di tab Salin.",
          "Kelompok dari hari lain butuh Punya Token Khusus?.",
        ],
        aksi: { label: "Buka SeeLabs", ke: "seelabs" },
      },
      {
        judul: "Salin, lalu Isi Lewat Bookmarklet",
        isi: [
          "Di IRIS, tekan Salin untuk SeeLabs di kelompok itu, lalu Salin untuk Bookmarklet.",
          "Pindah ke tab form SeeLabs, klik IRIS · Isi SeeLabs di bilah bookmark.",
          "Baris dicocokkan lewat NIM dan modulnya dipilih otomatis. Sel yang terisi ditandai, NIM yang tidak ketemu juga ditandai.",
          "Kalau form yang terbuka KLP lain, bookmarklet menolak dan tidak mengisi apa pun. Buka KLP yang benar lalu klik lagi.",
        ],
        aksi: { label: "Lihat Contoh Pengisian", ke: "cara" },
      },
      {
        judul: "Periksa, Simpan, lalu Tandai",
        isi: [
          "Periksa angkanya di form SeeLabs, lalu tekan Simpan Penilaian sendiri.",
          "Kembali ke IRIS dan tekan Sudah Disimpan di SeeLabs. Statusnya jadi Terkirim.",
          "Kalau nilainya diubah lagi setelah itu, statusnya jadi Berubah: salin dan simpan lagi di SeeLabs.",
        ],
        aksi: { label: "Buka Tab Salin", ke: "salin" },
      },
      {
        judul: "Kalau Ada Masalah",
        isi: [
          "KLP tidak muncul di SeeLabs: centang shift-nya di Input Jaga dulu, atau pakai token.",
          "NIM tidak ketemu: cocokkan KLP lewat Persiapan › Roster › Cocokkan KLP, lalu salin lagi.",
          "Bookmarklet diam saja: pastikan tab yang aktif adalah form Input Nilai, lalu seret ulang versi terbaru dari tab Bookmarklet.",
          "Pendapatan belum bertambah: cek kelompoknya sudah Kirim Nilai dan sesinya sudah diakhiri.",
          "Sesi TOT tidak dikirim ke SeeLabs dan tidak masuk pendapatan.",
        ],
        aksi: { label: "Lihat Contoh Tidak Cocok", ke: "tidak" },
      },
    ] as LangkahPanduan[],
  },
  en: {
    tab: "Guide",
    btn: "SeeLabs Guide",
    title: "Scores to SeeLabs Guide",
    sub: "From entering scores in IRIS to Simpan Penilaian in SeeLabs. Open it again any time from this tab.",
    step: (n: number, total: number) => `Step ${n} of ${total}`,
    prev: "Previous",
    next: "Next",
    done: "Done",
    restart: "Start Over",
    finished: "You've seen every step. Open it again any time from the Guide tab.",
    flow: ["Enter scores", "Send Scores", "Copy", "Fill SeeLabs", "Simpan Penilaian", "Mark Saved"],
    legendTitle: "Eight components, in SeeLabs' order",
    legend: [
      ["TP", "Preliminary assignment"],
      ["TA", "Initial assignment"],
      ["D1", "Active in assembling parts or software"],
      ["D2", "Active in operating the tools"],
      ["D3", "Active in group discussion"],
      ["D4", "Active in designing the app or analysis"],
      ["L1", "Lab Journal"],
      ["L2", "Lab Results Analysis"],
    ] as [string, string][],
    langkah: [
      {
        judul: "How It Flows",
        isi: [
          "Scores are entered once, in IRIS. SeeLabs has no API, so IRIS never signs in to SeeLabs for you.",
          "The IRIS · Isi SeeLabs bookmarklet fills the form in your own SeeLabs tab. You still press Simpan Penilaian yourself.",
          "The order: enter scores, Send Scores, copy, fill SeeLabs, Simpan Penilaian, then mark it saved in IRIS.",
        ],
      },
      {
        judul: "Once Only: Install the Bookmarklet",
        isi: [
          "Open the Bookmarklet tab and drag the IRIS · Isi SeeLabs button to your browser's bookmarks bar. Don't click it inside IRIS.",
          "Bookmarks bar hidden? Press Ctrl+Shift+B (Cmd+Shift+B on a Mac).",
          "Also put your SeeLabs account name on the Account page, so groups sent through your account are recorded right. Passwords are never stored.",
        ],
        aksi: { label: "Open the Bookmarklet Tab", ke: "pasang" },
      },
      {
        judul: "Enter Scores in IRIS",
        isi: [
          "Use the group inspector on the board, or the Score Table for many at once. Enter moves down like a spreadsheet.",
          "Per Student fills one student. Same for All fills that column for every present member.",
          "A student who didn't come: switch on Absent. Every field becomes 0 and Same for All skips them.",
          "Only the group's holder can enter scores. Groups another assistant holds are View Only.",
        ],
        aksi: { label: "Open the Score Table", ke: "tabel" },
      },
      {
        judul: "Send Scores",
        isi: [
          "Once every member has all eight fields, press Send Scores on that group. While a field is empty, the button says how many are left.",
          "After sending, each student sees their own scores on their Dashboard, never a groupmate's.",
          "Your payment unit for that group counts after Send Scores and after the session ends: Rp 32,500 for Regular, Rp 65,000 for International.",
          "You can still change scores after sending; students see the change at once.",
        ],
        aksi: { label: "Open the Score Table", ke: "tabel" },
      },
      {
        judul: "Check the SeeLabs Account",
        isi: [
          "Your first group goes through your own SeeLabs account.",
          "Holding two groups? SeeLabs pays one account per session, so the second group goes through another assistant who isn't teaching that slot. Pick the account in the group inspector.",
          "That account must have ticked its shift in SeeLabs Input Jaga (at most 2 shifts a day). If not, its KLP won't show without a token.",
          "Someone borrowed your account? Their group shows in the Held for You tab.",
        ],
        aksi: { label: "Open Held for You", ke: "titipan" },
      },
      {
        judul: "Open the SeeLabs Form",
        isi: [
          "In your own browser tab, sign in to SeeLabs Asisten, then Nilai Praktikum › Input Nilai.",
          "Pick the practicum: Pemrograman Perangkat IoT TE for Regular, or the INT one for International.",
          "Find your group's KLP number in Daftar Kelompok Jaga Hari Ini and press Input Nilai. The KLP number is on the Copy tab.",
          "Groups from another day need Punya Token Khusus?.",
        ],
        aksi: { label: "Open SeeLabs", ke: "seelabs" },
      },
      {
        judul: "Copy, Then Fill with the Bookmarklet",
        isi: [
          "In IRIS, press Copy for SeeLabs on that group, then Copy for the Bookmarklet.",
          "Switch to the SeeLabs form tab and click IRIS · Isi SeeLabs in the bookmarks bar.",
          "Rows are matched by NIM and the module is picked for you. Filled cells are marked, and so are NIMs it can't find.",
          "If the open form is another KLP, the bookmarklet refuses and fills nothing. Open the right KLP and click again.",
        ],
        aksi: { label: "See a Filling Example", ke: "cara" },
      },
      {
        judul: "Check, Save, Then Mark",
        isi: [
          "Check the numbers in the SeeLabs form, then press Simpan Penilaian yourself.",
          "Back in IRIS, press Saved in SeeLabs. The status becomes Sent.",
          "If scores change after that, the status becomes Changed: copy and save again in SeeLabs.",
        ],
        aksi: { label: "Open the Copy Tab", ke: "salin" },
      },
      {
        judul: "If Something Goes Wrong",
        isi: [
          "KLP not in SeeLabs: tick its shift in Input Jaga first, or use a token.",
          "A NIM isn't found: match the KLP in Preparation › Roster › Match KLP, then copy again.",
          "The bookmarklet does nothing: make sure the active tab is the Input Nilai form, then drag the latest version again from the Bookmarklet tab.",
          "Earnings haven't grown: check the group was sent and the session has ended.",
          "TOT sessions don't go to SeeLabs and don't count toward earnings.",
        ],
        aksi: { label: "See a Mismatch Example", ke: "tidak" },
      },
    ] as LangkahPanduan[],
  },
  zh: {
    tab: "指南",
    btn: "SeeLabs 指南",
    title: "分数提交到 SeeLabs 指南",
    sub: "从在 IRIS 填分数到在 SeeLabs 按 Simpan Penilaian。随时可以从这个标签再打开。",
    step: (n: number, total: number) => `第 ${n} 步，共 ${total} 步`,
    prev: "上一步",
    next: "下一步",
    done: "完成",
    restart: "从头开始",
    finished: "你已经看完所有步骤。随时可以从指南标签再打开。",
    flow: ["填分数", "发送分数", "复制", "填 SeeLabs", "Simpan Penilaian", "标记已保存"],
    legendTitle: "八个部分，顺序和 SeeLabs 一样",
    legend: [
      ["TP", "预习作业"],
      ["TA", "初始作业"],
      ["D1", "积极组装元件或软件"],
      ["D2", "积极操作设备"],
      ["D3", "积极参与小组讨论"],
      ["D4", "积极设计应用或分析"],
      ["L1", "实验日志"],
      ["L2", "实验结果分析"],
    ] as [string, string][],
    langkah: [
      {
        judul: "整体流程",
        isi: [
          "分数只在 IRIS 填一次。SeeLabs 没有 API，所以 IRIS 从不替你登录 SeeLabs。",
          "书签小工具 IRIS · Isi SeeLabs 只在你自己的 SeeLabs 标签页里填表。Simpan Penilaian 仍由你自己按。",
          "顺序：填分数、发送分数、复制、填 SeeLabs、Simpan Penilaian，然后在 IRIS 标记已保存。",
        ],
      },
      {
        judul: "只需一次：安装书签小工具",
        isi: [
          "打开书签小工具标签，把 IRIS · Isi SeeLabs 按钮拖到浏览器书签栏。不要在 IRIS 里点它。",
          "看不到书签栏？按 Ctrl+Shift+B（Mac 上是 Cmd+Shift+B）。",
          "也在账户页填上你的 SeeLabs 账户名，这样用你账户提交的组会被正确记录。密码从不保存。",
        ],
        aksi: { label: "打开书签小工具标签", ke: "pasang" },
      },
      {
        judul: "在 IRIS 填分数",
        isi: [
          "在看板的小组检查器里填，或者用分数表一次填很多。按 Enter 像表格一样往下走。",
          "逐人填一位学生。全组同分会把这一列填给所有到场的组员。",
          "没来的学生：打开缺席。所有格子变成 0，全组同分会跳过他们。",
          "只有带这个组的助教能填。别人带的组只能查看。",
        ],
        aksi: { label: "打开分数表", ke: "tabel" },
      },
      {
        judul: "发送分数",
        isi: [
          "每位组员的八个格子都填好后，在这个组按发送分数。还有空着的格子时，按钮会提示还差几个。",
          "发送后，每位学生在仪表盘只看到自己的分数，看不到组员的。",
          "发送分数并且下课后，这个组的报酬单位才会记下：普通班 Rp 32.500，国际班 Rp 65.000。",
          "发送后还可以改分数，学生会马上看到。",
        ],
        aksi: { label: "打开分数表", ke: "tabel" },
      },
      {
        judul: "确认 SeeLabs 账户",
        isi: [
          "你的第一个组用你自己的 SeeLabs 账户提交。",
          "带两个组？SeeLabs 每节课只给一个账户付钱，所以第二个组用这个时段没上课的另一位助教的账户提交。在小组检查器里选账户。",
          "那个账户必须已在 SeeLabs Input Jaga 勾选该时段（一天最多 2 个）。否则没有令牌就看不到这个 KLP。",
          "有人借用了你的账户？他们的组会出现在替你保管标签里。",
        ],
        aksi: { label: "打开替你保管", ke: "titipan" },
      },
      {
        judul: "打开 SeeLabs 表单",
        isi: [
          "在你自己的浏览器标签页登录 SeeLabs Asisten，然后进入 Nilai Praktikum › Input Nilai。",
          "选实验课：普通班选 Pemrograman Perangkat IoT TE，国际班选 INT 那个。",
          "在 Daftar Kelompok Jaga Hari Ini 里找到你们组的 KLP 号，按 Input Nilai。KLP 号写在复制标签里。",
          "其他日子的组需要 Punya Token Khusus?。",
        ],
        aksi: { label: "打开 SeeLabs", ke: "seelabs" },
      },
      {
        judul: "复制，再用书签小工具填写",
        isi: [
          "在 IRIS 里对这个组按复制给 SeeLabs，再按为书签小工具复制。",
          "切到 SeeLabs 表单标签页，点书签栏里的 IRIS · Isi SeeLabs。",
          "按 NIM 对应每一行，并自动选好模块。填好的格子和找不到的 NIM 都会标出来。",
          "如果打开的是别的 KLP，书签小工具会拒绝，什么也不填。打开正确的 KLP 再点一次。",
        ],
        aksi: { label: "看填写示例", ke: "cara" },
      },
      {
        judul: "检查、保存，再标记",
        isi: [
          "在 SeeLabs 表单里检查数字，然后自己按 Simpan Penilaian。",
          "回到 IRIS 按已在 SeeLabs 保存。状态变成已发送。",
          "之后如果分数又改了，状态会变成有改动：再复制一次并在 SeeLabs 保存。",
        ],
        aksi: { label: "打开复制标签", ke: "salin" },
      },
      {
        judul: "遇到问题时",
        isi: [
          "SeeLabs 里没有这个 KLP：先在 Input Jaga 勾选时段，或者用令牌。",
          "找不到某个 NIM：在准备 › 名单 › 匹配 KLP 里匹配好，再复制一次。",
          "书签小工具没反应：确认当前标签页是 Input Nilai 表单，再从书签小工具标签重新拖最新版本。",
          "收入没增加：检查这个组已发送分数，并且课已结束。",
          "TOT 课不提交到 SeeLabs，也不计入收入。",
        ],
        aksi: { label: "看不匹配示例", ke: "tidak" },
      },
    ] as LangkahPanduan[],
  },
});
