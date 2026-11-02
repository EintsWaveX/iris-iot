/**
 * Tubes (R5) words, Indonesian, English and Mandarin. One dict for the CaAs's
 * cards and one for the Panitia's tab. Plain everyday copy; tech words stay
 * English (zip, link, upload).
 */
import { dict } from "../../../lib/app";
import type { TubesGalat } from "../../../lib/recruitment/tubes-api";

type Err = Partial<
  Record<
    | TubesGalat
    | "offline"
    | "lain"
    | "tanpa_hak"
    | "data_salah"
    | "sudah_ada"
    | "sudah_diurutkan"
    | "tidak_ditemukan",
    string
  >
>;

export interface TubesWords {
  err: Err;
  caas: {
    title: string;
    lede: string;
    step: { team: string; evening: string; topic: string; submit: string; turn: string };
    // team
    noTeam: string;
    noTeamBody: (min: number, max: number) => string;
    make: string;
    invitesTitle: string;
    inviteFrom: (leader: string, size: number, max: number) => string;
    accept: string;
    decline: string;
    members: (n: number, min: number, max: number) => string;
    leader: string;
    you: string;
    waiting: string;
    invite: string;
    inviteTitle: string;
    inviteBody: string;
    nim: string;
    nimHint: string;
    send: string;
    cancelInvite: string;
    kick: string;
    leave: string;
    leaveAsk: string;
    disband: string;
    disbandAsk: string;
    rename: string;
    renameTitle: string;
    teamName: string;
    save: string;
    cancel: string;
    close: string;
    tooFew: (min: number) => string;
    tooMany: (max: number) => string;
    locked: string;
    lockedAt: (when: string) => string;
    lockSoon: (when: string) => string;
    // evening
    eveningNone: string;
    eveningBody: string;
    eveningPick: string;
    eveningChange: string;
    eveningTitle: string;
    eveningLede: string;
    eveningSeats: (left: number, cap: number) => string;
    eveningFull: string;
    eveningPast: string;
    eveningMine: string;
    eveningMembersWait: string;
    eveningNeedTeam: string;
    eveningCutoff: string;
    eveningQr: string;
    eveningCame: string;
    eveningNotYet: string;
    confirm: string;
    noEvenings: string;
    // topic
    topicSoon: (when: string) => string;
    topicWait: string;
    topicNone: string;
    topicBrief: string;
    // submit
    submitTitle: string;
    submitBody: string;
    submitNotYet: (when: string) => string;
    closesIn: string;
    closedLate: string;
    overridden: (until: string) => string;
    overrideNote: string;
    partEmpty: string;
    partNeeded: string;
    partOptional: string;
    sendFile: string;
    replace: string;
    remove: string;
    open: string;
    limit: (ext: string, mb: number) => string;
    pickFile: string;
    uploading: (p: number) => string;
    sentOk: string;
    removedOk: string;
    asLink: string;
    asFile: string;
    linkLabel: string;
    linkHint: string;
    linkSave: string;
    status: { none: string; partial: string; complete: string; late: string; over: string };
    by: (n: string) => string;
    // turn
    turnTitle: string;
    turnNone: string;
    turnBody: (table: string, at: string) => string;
    // misc
    next: {
      team: string;
      evening: string;
      topic: string;
      submit: string;
      turn: string;
      done: string;
    };
    loading: string;
  };
  panel: {
    title: string;
    sections: { topik: string; tim: string; kumpul: string; presentasi: string };
    sub: { order: string; mine: string; nilai: string; template: string };
    locked: string;
    open: string;
    // topics
    mode: string;
    modeSet: string;
    modeDraw: string;
    teamSize: string;
    teamMin: string;
    teamMax: string;
    publishTitle: string;
    published: string;
    draft: string;
    publishBody: (when: string) => string;
    publishDrawn: string;
    publishNow: string;
    withdraw: string;
    publishWait: (unassigned: number, over: number) => string;
    addTopic: string;
    editTopic: string;
    shareEvenly: string;
    topicExample: string;
    topicExampleTag: string;
    topicTitle: string;
    topicBrief: string;
    topicCap: string;
    topicSave: string;
    topicDelete: string;
    topicTeams: (n: number, cap: number) => string;
    topicWho: string;
    topicNone: string;
    topicSet: string;
    drawScreen: string;
    drawTitle: string;
    drawLede: string;
    drawNext: string;
    drawNow: string;
    drawDone: string;
    spin: string;
    spinning: string;
    drawAll: string;
    drawRestart: string;
    drawn: (n: number, total: number) => string;
    noTopics: string;
    topicsHint: string;
    // teams and evenings
    teams: string;
    teamsOf: (n: number) => string;
    unteamed: (n: number) => string;
    makeTeams: string;
    makeTeamsBody: (n: number, min: number, max: number) => string;
    lockTeams: string;
    unlockTeams: string;
    lockAuto: string;
    lockForced: (mode: string) => string;
    addMember: string;
    removeMember: string;
    makeLeader: string;
    disband: string;
    disbandAsk: string;
    newTeam: string;
    renameTeam: string;
    size: (n: number) => string;
    tooFew: string;
    tooMany: string;
    noTeamYet: string;
    evenings: string;
    eveningAdd: string;
    eveningEdit: string;
    eveningSeed: string;
    eveningSeedBody: string;
    eveningDate: string;
    eveningFrom: string;
    eveningTo: string;
    eveningCap: string;
    eveningPlace: string;
    eveningSeats: (used: number, cap: number) => string;
    eveningTeams: (n: number) => string;
    eveningNoTeam: string;
    move: string;
    moveFull: string;
    force: string;
    attend: string;
    attendHere: (n: number, of: number) => string;
    tick: string;
    ticked: string;
    qrOpen: string;
    qrNote: string;
    noEvenings: string;
    // submissions
    kumpul: string;
    parts: string;
    partsEdit: string;
    partsHint: string;
    partLabel: string;
    partExt: string;
    partMb: string;
    partReq: string;
    partLink: string;
    partAdd: string;
    partCap: (mb: number) => string;
    allowedFiles: string;
    status: { none: string; partial: string; complete: string; late: string; over: string };
    view: string;
    closeAt: (when: string) => string;
    openFile: string;
    openLink: string;
    override: string;
    overrideTitle: string;
    overrideBody: string;
    overrideNote: string;
    overrideNoteHint: string;
    overrideUntil: string;
    overrideNone: string;
    overrideSave: string;
    overrideClear: string;
    overrideBy: (by: string) => string;
    overrideOnly: string;
    noFiles: string;
    // presentasi
    order: string;
    tables: string;
    tablesMake: string;
    tablesCount: string;
    tablesWarn: string;
    deal: string;
    dealAsk: string;
    table: (n: string) => string;
    turn: (n: number) => string;
    up: string;
    down: string;
    toTable: string;
    unplaced: (n: number) => string;
    place: string;
    emptyTable: string;
    examiners: string;
    examinersHint: string;
    rubricNote: string;
    noTables: string;
    save: string;
    cancel: string;
    close: string;
    done: string;
  };
}

const ID: TubesWords = {
  err: {
    bukan_tahap: "Kamu belum sampai tahap Tubes.",
    terkunci: "Tim sudah dikunci. Hubungi Panitia kalau perlu diubah.",
    sudah_punya_tim: "Orang ini sudah punya tim.",
    belum_punya_tim: "Kamu belum punya tim.",
    bukan_pemimpin: "Ini hanya bisa dilakukan pemimpin tim.",
    penuh: "Sudah penuh.",
    lewat: "Sudah lewat batas. Perubahan malam ini sampai H-1 pukul 23.59.",
    belum_buka: "Belum dibuka. Pengumpulan mulai di malam pengerjaan pertama.",
    tutup: "Pengumpulan sudah ditutup.",
    nim_tidak_ada: "NIM ini tidak ada di Tubes.",
    sudah_diundang: "Sudah diundang atau sudah di tim ini.",
    tidak_ada_undangan: "Undangannya sudah tidak ada.",
    ukuran_tim: "Jumlah anggota tim belum sesuai.",
    bagian_salah: "Bagian ini tidak ada.",
    ekstensi: "Jenis file ini tidak diterima untuk bagian ini.",
    terlalu_besar: "File terlalu besar.",
    kosong: "File kosong.",
    link_salah: "Link harus diawali https:// dan tanpa spasi.",
    berkas_hilang: "File belum sampai di server. Coba kirim lagi.",
    berkas_beda: "File yang sampai tidak sama. Coba kirim lagi.",
    belum_diatur: "Penyimpanan file belum diatur. Hubungi Panitia.",
    topik_penuh: "Topik belum bisa diterbitkan.",
    tidak_ada: "Tidak ditemukan.",
    offline: "Tidak tersambung. Coba lagi.",
    lain: "Gagal. Coba lagi.",
    tanpa_hak: "Kamu tidak punya hak untuk ini.",
    data_salah: "Isiannya belum benar.",
    sudah_ada: "Sudah ada.",
    sudah_diurutkan: "Tim ini sudah punya giliran presentasi.",
    tidak_ditemukan: "Tidak ditemukan.",
  },
  caas: {
    title: "Tubes",
    lede: "Kerjakan satu proyek bersama timmu, kumpulkan, lalu presentasikan.",
    step: {
      team: "Tim",
      evening: "Malam pengerjaan",
      topic: "Topik",
      submit: "Pengumpulan",
      turn: "Presentasi",
    },
    noTeam: "Kamu belum punya tim",
    noTeamBody: (min, max) =>
      `Tubes dikerjakan berkelompok, ${min} sampai ${max} orang. Buat tim lalu undang temanmu lewat NIM, atau terima undangan kalau ada.`,
    make: "Buat Tim",
    invitesTitle: "Undangan untukmu",
    inviteFrom: (l, s, m) => `${l} mengajakmu · ${s} dari ${m} anggota`,
    accept: "Terima",
    decline: "Tolak",
    members: (n, min, max) => `${n} anggota · minimal ${min}, paling banyak ${max}`,
    leader: "Pemimpin",
    you: "Kamu",
    waiting: "Menunggu jawaban",
    invite: "Undang Teman",
    inviteTitle: "Undang Teman ke Timmu",
    inviteBody:
      "Tulis NIM temanmu. Hanya CaAs yang sudah sampai Tubes dan belum punya tim yang bisa diundang.",
    nim: "NIM",
    nimHint: "Contoh: 1301234567",
    send: "Kirim Undangan",
    cancelInvite: "Batalkan",
    kick: "Keluarkan",
    leave: "Keluar dari Tim",
    leaveAsk: "Keluar dari tim ini? Kamu bisa diundang lagi selama tim belum dikunci.",
    disband: "Bubarkan Tim",
    disbandAsk: "Bubarkan tim? Semua anggota jadi tanpa tim.",
    rename: "Ganti Nama",
    renameTitle: "Nama Tim",
    teamName: "Nama tim",
    save: "Simpan",
    cancel: "Batal",
    close: "Tutup",
    tooFew: (min) => `Tim masih kurang. Minimal ${min} orang supaya bisa memilih malam.`,
    tooMany: (max) => `Tim melebihi ${max} orang. Panitia akan mengaturnya.`,
    locked: "Tim sudah dikunci",
    lockedAt: (w) => `Dikunci sejak ${w}. Hubungi Panitia kalau ada yang perlu diubah.`,
    lockSoon: (w) => `Tim dikunci saat Techmeet, ${w}. Pastikan timmu sudah lengkap.`,
    eveningNone: "Belum memilih malam",
    eveningBody:
      "Pilih satu malam untuk mengerjakan Tubes di Lab IRIS bersama timmu. Di malam itu kalian absen lewat QR di pintu.",
    eveningPick: "Pilih Malam",
    eveningChange: "Ganti Malam",
    eveningTitle: "Pilih Malam Pengerjaan",
    eveningLede: "Satu malam untuk seluruh timmu. Kursi dihitung per orang.",
    eveningSeats: (l, c) => `${l} kursi tersisa dari ${c}`,
    eveningFull: "Penuh untuk timmu",
    eveningPast: "Sudah lewat batas",
    eveningMine: "Malam timmu",
    eveningMembersWait: "Pemimpin tim yang memilih malamnya. Kamu akan melihatnya di sini.",
    eveningNeedTeam: "Lengkapi tim dulu, baru pilih malam.",
    eveningCutoff: "Bisa diganti sampai H-1 pukul 23.59.",
    eveningQr: "Di malam ini, scan QR di Lab IRIS untuk absen.",
    eveningCame: "Kamu sudah tercatat hadir.",
    eveningNotYet: "Kehadiran dicatat di malam itu lewat QR.",
    confirm: "Pilih Malam Ini",
    noEvenings: "Panitia belum membuka malam pengerjaan.",
    topicSoon: (w) => `Topik terbit saat Techmeet, ${w}.`,
    topicWait: "Topik timmu sudah ditentukan, tapi belum terbit. Kamu akan melihatnya di sini.",
    topicNone: "Belum ada topik untuk timmu.",
    topicBrief: "Brief",
    submitTitle: "Pengumpulan",
    submitBody:
      "Satu pengumpulan untuk seluruh tim. Siapa saja di tim boleh mengirim atau mengganti.",
    submitNotYet: (w) => `Pengumpulan dibuka di malam pengerjaan pertama, ${w}.`,
    closesIn: "Ditutup saat presentasi mulai",
    closedLate: "Pengumpulan sudah ditutup. Yang telat tidak diterima, kecuali Ketua mengizinkan.",
    overridden: (u) => `Ketua mengizinkan tim ini mengirim${u ? ` sampai ${u}` : ""}.`,
    overrideNote: "Catatan Ketua",
    partEmpty: "Belum ada",
    partNeeded: "Wajib",
    partOptional: "Boleh dikosongkan",
    sendFile: "Kirim",
    replace: "Ganti",
    remove: "Hapus",
    open: "Buka",
    limit: (e, mb) => `${e}, paling besar ${mb} MB`,
    pickFile: "Pilih file",
    uploading: (p) => `Mengirim ${p}%`,
    sentOk: "Terkirim.",
    removedOk: "Dihapus.",
    asLink: "Pakai link",
    asFile: "Upload file",
    linkLabel: "Link video",
    linkHint: "https://... (YouTube, Drive, dan sejenisnya, pastikan bisa dibuka Panitia)",
    linkSave: "Simpan Link",
    status: {
      none: "Belum ada",
      partial: "Sebagian",
      complete: "Lengkap",
      late: "Telat, ditolak",
      over: "Izin Ketua",
    },
    by: (n) => `oleh ${n}`,
    turnTitle: "Presentasi",
    turnNone: "Giliran presentasi timmu belum diatur. Panitia akan membagikannya.",
    turnBody: (t, a) => `${t}, mulai sekitar ${a}`,
    next: {
      team: "Buat atau gabung ke satu tim.",
      evening: "Pilih malam pengerjaan timmu.",
      topic: "Tunggu topik timmu terbit.",
      submit: "Kerjakan dan kumpulkan sebelum presentasi.",
      turn: "Siapkan presentasimu.",
      done: "Semua sudah beres. Tinggal presentasi.",
    },
    loading: "Memuat",
  },
  panel: {
    title: "Tubes",
    sections: {
      topik: "Topik dan Brief",
      tim: "Tim dan Malam",
      kumpul: "Pengumpulan",
      presentasi: "Presentasi",
    },
    sub: { order: "Urutan", mine: "Mejaku", nilai: "Penilaian", template: "Rubrik" },
    locked: "Dikunci",
    open: "Terbuka",
    mode: "Cara membagi topik",
    modeSet: "Ditetapkan Akademik",
    modeDraw: "Diundi saat Techmeet",
    teamSize: "Anggota per tim",
    teamMin: "Minimal",
    teamMax: "Paling banyak",
    publishTitle: "Terbit di Techmeet",
    published: "Sudah terbit",
    draft: "Draf",
    publishBody: (w) => `${w}. Setelah terbit, tiap tim hanya melihat topiknya sendiri.`,
    publishDrawn: "Topik muncul di halaman tiap tim begitu timnya diundi.",
    publishNow: "Terbitkan Sekarang",
    withdraw: "Tarik Kembali",
    publishWait: (u, o) =>
      `${u > 0 ? `${u} tim belum dapat topik. ` : ""}${o > 0 ? `${o} topik melebihi kapasitas. ` : ""}Tombol terbit menunggu sampai itu beres.`,
    addTopic: "Tambah Topik",
    editTopic: "Ubah Topik",
    shareEvenly: "Bagi Rata",
    topicExample: "Topik di bawah adalah contoh bila belum kamu ganti.",
    topicExampleTag: "Contoh",
    topicTitle: "Judul",
    topicBrief: "Brief untuk tim",
    topicCap: "Paling banyak berapa tim",
    topicSave: "Simpan Topik",
    topicDelete: "Hapus",
    topicTeams: (n, c) => `${n} dari ${c} tim`,
    topicWho: "Siapa yang Mendapat",
    topicNone: "Tanpa topik",
    topicSet: "Topik",
    drawScreen: "Layar Undian",
    drawTitle: "Layar Undian Topik",
    drawLede:
      "Dipakai di Techmeet. Tiap tim diundi satu per satu; topiknya baru muncul di halamannya setelah diundi.",
    drawNext: "Giliran berikutnya",
    drawNow: "Sedang diundi",
    drawDone: "Semua tim sudah diundi",
    spin: "Putar",
    spinning: "Berputar",
    drawAll: "Undi Semua Sekaligus",
    drawRestart: "Ulangi Undian",
    drawn: (n, t) => `${n} dari ${t} tim sudah diundi`,
    noTopics: "Belum ada topik. Tambahkan dulu.",
    topicsHint: "Hanya Akademik yang mengubah topik. Kamu bisa membacanya.",
    teams: "Tim",
    teamsOf: (n) => `${n} tim`,
    unteamed: (n) => `${n} CaAs belum punya tim`,
    makeTeams: "Bagi Otomatis",
    makeTeamsBody: (n, min, max) =>
      `${n} CaAs yang belum punya tim dikelompokkan acak menjadi tim ${min} sampai ${max} orang.`,
    lockTeams: "Kunci Tim Sekarang",
    unlockTeams: "Buka Kunci",
    lockAuto: "Mengikuti jam: dikunci saat Techmeet",
    lockForced: (m) => `Diatur Panitia: ${m}`,
    addMember: "Tambah Anggota",
    removeMember: "Keluarkan",
    makeLeader: "Jadikan Pemimpin",
    disband: "Bubarkan",
    disbandAsk: "Bubarkan tim ini? Anggotanya jadi tanpa tim.",
    newTeam: "Tim Baru",
    renameTeam: "Ganti Nama",
    size: (n) => `${n} orang`,
    tooFew: "Kurang dari minimal",
    tooMany: "Melebihi batas",
    noTeamYet: "Belum ada tim.",
    evenings: "Malam pengerjaan",
    eveningAdd: "Tambah Malam",
    eveningEdit: "Ubah Malam",
    eveningSeed: "Buat dari Kalender",
    eveningSeedBody: "Satu malam untuk tiap hari acara Pengerjaan. Isi kursi per malam.",
    eveningDate: "Tanggal",
    eveningFrom: "Mulai",
    eveningTo: "Selesai",
    eveningCap: "Kursi (orang)",
    eveningPlace: "Tempat",
    eveningSeats: (u, c) => `${u} dari ${c} kursi`,
    eveningTeams: (n) => `${n} tim`,
    eveningNoTeam: "Belum ada tim di malam ini.",
    move: "Pindahkan ke malam",
    moveFull: "Malam ini penuh untuk tim itu. Tetap pindahkan?",
    force: "Tetap pindahkan",
    attend: "Kehadiran",
    attendHere: (n, o) => `${n} dari ${o} hadir`,
    tick: "Tandai Hadir",
    ticked: "Hadir",
    qrOpen: "Buka Layar QR",
    qrNote: "QR dipindai di pintu pada malam tim itu memilih.",
    noEvenings: "Belum ada malam. Buat dari Kalender atau tambah satu.",
    kumpul: "Pengumpulan",
    parts: "Bagian pengumpulan",
    partsEdit: "Atur Bagian",
    partsHint: "Jenis file dan batas ukurannya. Batas paling besar mengikuti penyimpanan.",
    partLabel: "Nama bagian",
    partExt: "Jenis file (pisahkan koma)",
    partMb: "Batas (MB)",
    partReq: "Wajib",
    partLink: "Boleh pakai link",
    partAdd: "Tambah Bagian",
    partCap: (mb) => `Paling besar ${mb} MB`,
    allowedFiles: "File",
    status: {
      none: "Belum ada",
      partial: "Sebagian",
      complete: "Lengkap",
      late: "Telat, ditolak",
      over: "Izin Ketua",
    },
    view: "Lihat",
    closeAt: (w) => `Ditutup ${w}`,
    openFile: "Unduh",
    openLink: "Buka Link",
    override: "Izinkan Susulan",
    overrideTitle: "Izinkan Pengumpulan Susulan",
    overrideBody:
      "Tim ini boleh mengirim walau pengumpulan sudah ditutup. Alasannya wajib dan tercatat atas namamu.",
    overrideNote: "Alasan",
    overrideNoteHint: "Contoh: laptop rusak dua hari, servis resmi.",
    overrideUntil: "Boleh sampai",
    overrideNone: "Tanpa batas waktu",
    overrideSave: "Izinkan",
    overrideClear: "Cabut Izin",
    overrideBy: (b) => `Izin dari ${b}`,
    overrideOnly: "Hanya Ketua yang memberi izin.",
    noFiles: "Belum ada yang dikirim.",
    order: "Urutan Presentasi",
    tables: "Meja",
    tablesMake: "Buat Meja",
    tablesCount: "Jumlah meja",
    tablesWarn: "Membuat ulang meja menghapus pembagian dan penguji di meja lama.",
    deal: "Bagi Urutan",
    dealAsk: "Bagi ulang semua tim secara acak? Urutan sekarang diganti.",
    table: (n) => n,
    turn: (n) => `Giliran ${n}`,
    up: "Naikkan",
    down: "Turunkan",
    toTable: "Pindah ke meja",
    unplaced: (n) => `${n} tim belum punya meja`,
    place: "Taruh di meja",
    emptyTable: "Belum ada tim di meja ini.",
    examiners: "Penguji meja",
    examinersHint: "Atur penguji tiap meja di bagian Urutan ini lewat Plotting penguji di bawah.",
    rubricNote: "Baris rubrik adalah contoh sampai Akademik menggantinya di tab Rubrik.",
    noTables: "Belum ada meja. Buat dulu.",
    save: "Simpan",
    cancel: "Batal",
    close: "Tutup",
    done: "Selesai",
  },
};

const EN: TubesWords = {
  err: {
    bukan_tahap: "You have not reached the Tubes stage.",
    terkunci: "The teams are locked. Ask Panitia if something needs to change.",
    sudah_punya_tim: "That person already has a team.",
    belum_punya_tim: "You have no team yet.",
    bukan_pemimpin: "Only the team leader can do this.",
    penuh: "It is full.",
    lewat: "Too late. An evening can change until 23.59 the day before.",
    belum_buka: "Not open yet. Submitting starts on the first work evening.",
    tutup: "The submission is closed.",
    nim_tidak_ada: "That NIM is not in Tubes.",
    sudah_diundang: "Already invited, or already in this team.",
    tidak_ada_undangan: "That invite is gone.",
    ukuran_tim: "The team size is not right yet.",
    bagian_salah: "There is no such part.",
    ekstensi: "This kind of file is not accepted for this part.",
    terlalu_besar: "The file is too big.",
    kosong: "The file is empty.",
    link_salah: "A link must start with https:// and have no spaces.",
    berkas_hilang: "The file did not reach the server. Send it again.",
    berkas_beda: "The file that arrived is not the same. Send it again.",
    belum_diatur: "File storage is not set up. Ask Panitia.",
    topik_penuh: "The topics cannot be published yet.",
    tidak_ada: "Not found.",
    offline: "No connection. Try again.",
    lain: "Failed. Try again.",
    tanpa_hak: "You do not have the right for this.",
    data_salah: "Something in the form is not right.",
    sudah_ada: "It already exists.",
    sudah_diurutkan: "This team already has a presentation turn.",
    tidak_ditemukan: "Not found.",
  },
  caas: {
    title: "Tubes",
    lede: "Build one project with your team, hand it in, then present it.",
    step: {
      team: "Team",
      evening: "Work evening",
      topic: "Topic",
      submit: "Submission",
      turn: "Presentation",
    },
    noTeam: "You have no team yet",
    noTeamBody: (min, max) =>
      `Tubes is done in a team of ${min} to ${max}. Make a team and invite friends by NIM, or accept an invite if you have one.`,
    make: "Make a Team",
    invitesTitle: "Invites for you",
    inviteFrom: (l, s, m) => `${l} asked you · ${s} of ${m} members`,
    accept: "Accept",
    decline: "Decline",
    members: (n, min, max) => `${n} members · at least ${min}, at most ${max}`,
    leader: "Leader",
    you: "You",
    waiting: "Waiting for an answer",
    invite: "Invite a Friend",
    inviteTitle: "Invite a Friend to Your Team",
    inviteBody:
      "Write your friend's NIM. Only CaAs who have reached Tubes and have no team yet can be invited.",
    nim: "NIM",
    nimHint: "E.g. 1301234567",
    send: "Send Invite",
    cancelInvite: "Cancel",
    kick: "Remove",
    leave: "Leave the Team",
    leaveAsk: "Leave this team? You can be invited again while teams are open.",
    disband: "Disband the Team",
    disbandAsk: "Disband the team? Everyone ends up without a team.",
    rename: "Rename",
    renameTitle: "Team Name",
    teamName: "Team name",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    tooFew: (min) =>
      `The team is short. It needs at least ${min} people before it can pick an evening.`,
    tooMany: (max) => `The team has more than ${max}. Panitia will sort it out.`,
    locked: "The team is locked",
    lockedAt: (w) => `Locked since ${w}. Ask Panitia if something needs to change.`,
    lockSoon: (w) => `Teams lock at the Techmeet, ${w}. Make sure your team is complete.`,
    eveningNone: "No evening picked yet",
    eveningBody:
      "Pick one evening to work on Tubes at Lab IRIS with your team. That evening you check in by QR at the door.",
    eveningPick: "Pick an Evening",
    eveningChange: "Change Evening",
    eveningTitle: "Pick a Work Evening",
    eveningLede: "One evening for your whole team. Seats are counted per person.",
    eveningSeats: (l, c) => `${l} seats left of ${c}`,
    eveningFull: "Full for your team",
    eveningPast: "Past the cutoff",
    eveningMine: "Your team's evening",
    eveningMembersWait: "The team leader picks the evening. You will see it here.",
    eveningNeedTeam: "Complete the team first, then pick an evening.",
    eveningCutoff: "It can change until 23.59 the day before.",
    eveningQr: "That evening, scan the QR at Lab IRIS to check in.",
    eveningCame: "You are marked present.",
    eveningNotYet: "Attendance is taken that evening by QR.",
    confirm: "Pick This Evening",
    noEvenings: "Panitia has not opened the work evenings yet.",
    topicSoon: (w) => `Topics are published at the Techmeet, ${w}.`,
    topicWait: "Your team's topic is set but not published. You will see it here.",
    topicNone: "No topic for your team yet.",
    topicBrief: "Brief",
    submitTitle: "Submission",
    submitBody: "One submission for the whole team. Anyone on the team may send or replace a part.",
    submitNotYet: (w) => `Submitting opens on the first work evening, ${w}.`,
    closesIn: "Closes when the presentation starts",
    closedLate: "The submission is closed. Late files are refused unless the Ketua allows it.",
    overridden: (u) => `The Ketua lets this team send${u ? ` until ${u}` : ""}.`,
    overrideNote: "The Ketua's note",
    partEmpty: "Nothing yet",
    partNeeded: "Required",
    partOptional: "May stay empty",
    sendFile: "Send",
    replace: "Replace",
    remove: "Remove",
    open: "Open",
    limit: (e, mb) => `${e}, up to ${mb} MB`,
    pickFile: "Pick a file",
    uploading: (p) => `Sending ${p}%`,
    sentOk: "Sent.",
    removedOk: "Removed.",
    asLink: "Use a link",
    asFile: "Upload a file",
    linkLabel: "Video link",
    linkHint: "https://... (YouTube, Drive and so on; make sure Panitia can open it)",
    linkSave: "Save Link",
    status: {
      none: "Nothing yet",
      partial: "Partial",
      complete: "Complete",
      late: "Late, refused",
      over: "Ketua's OK",
    },
    by: (n) => `by ${n}`,
    turnTitle: "Presentation",
    turnNone: "Your team's presentation turn is not set yet. Panitia will hand them out.",
    turnBody: (t, a) => `${t}, starting around ${a}`,
    next: {
      team: "Make or join a team.",
      evening: "Pick your team's work evening.",
      topic: "Wait for your team's topic.",
      submit: "Build it and hand it in before the presentation.",
      turn: "Get your presentation ready.",
      done: "Everything is in place. Only the presentation is left.",
    },
    loading: "Loading",
  },
  panel: {
    title: "Tubes",
    sections: {
      topik: "Topics and Brief",
      tim: "Teams and Evenings",
      kumpul: "Submissions",
      presentasi: "Presentation",
    },
    sub: { order: "Order", mine: "My Table", nilai: "Scoring", template: "Rubric" },
    locked: "Locked",
    open: "Open",
    mode: "How topics are given out",
    modeSet: "Set by Akademik",
    modeDraw: "Drawn at the Techmeet",
    teamSize: "Members per team",
    teamMin: "At least",
    teamMax: "At most",
    publishTitle: "Published at the Techmeet",
    published: "Published",
    draft: "Draft",
    publishBody: (w) => `${w}. Once published, each team sees only its own topic.`,
    publishDrawn: "A topic shows on a team's page as soon as the team is drawn.",
    publishNow: "Publish Now",
    withdraw: "Withdraw",
    publishWait: (u, o) =>
      `${u > 0 ? `${u} teams have no topic. ` : ""}${o > 0 ? `${o} topics are over capacity. ` : ""}Publishing waits until that is settled.`,
    addTopic: "Add Topic",
    editTopic: "Edit Topic",
    shareEvenly: "Share Out Evenly",
    topicExample: "The topics below are examples until you replace them.",
    topicExampleTag: "Example",
    topicTitle: "Title",
    topicBrief: "Brief for the teams",
    topicCap: "Most teams for this topic",
    topicSave: "Save Topic",
    topicDelete: "Delete",
    topicTeams: (n, c) => `${n} of ${c} teams`,
    topicWho: "Who Gets It",
    topicNone: "No topic",
    topicSet: "Topic",
    drawScreen: "Draw Screen",
    drawTitle: "Topic Draw Screen",
    drawLede:
      "Used at the Techmeet. Each team is drawn in turn; its topic only shows on its page once drawn.",
    drawNext: "Up next",
    drawNow: "Drawing now",
    drawDone: "Every team has been drawn",
    spin: "Spin",
    spinning: "Spinning",
    drawAll: "Draw Everyone at Once",
    drawRestart: "Restart the Draw",
    drawn: (n, t) => `${n} of ${t} teams drawn`,
    noTopics: "No topics yet. Add some first.",
    topicsHint: "Only Akademik edits topics. You can read them.",
    teams: "Teams",
    teamsOf: (n) => `${n} teams`,
    unteamed: (n) => `${n} CaAs have no team`,
    makeTeams: "Group Automatically",
    makeTeamsBody: (n, min, max) =>
      `The ${n} CaAs with no team are grouped at random into teams of ${min} to ${max}.`,
    lockTeams: "Lock Teams Now",
    unlockTeams: "Unlock",
    lockAuto: "Follows the clock: locks at the Techmeet",
    lockForced: (m) => `Set by Panitia: ${m}`,
    addMember: "Add Member",
    removeMember: "Remove",
    makeLeader: "Make Leader",
    disband: "Disband",
    disbandAsk: "Disband this team? Its members end up without a team.",
    newTeam: "New Team",
    renameTeam: "Rename",
    size: (n) => `${n} people`,
    tooFew: "Below the minimum",
    tooMany: "Over the limit",
    noTeamYet: "No teams yet.",
    evenings: "Work evenings",
    eveningAdd: "Add Evening",
    eveningEdit: "Edit Evening",
    eveningSeed: "Make from the Calendar",
    eveningSeedBody: "One evening for each day of the Pengerjaan event. Set the seats per evening.",
    eveningDate: "Date",
    eveningFrom: "Starts",
    eveningTo: "Ends",
    eveningCap: "Seats (people)",
    eveningPlace: "Place",
    eveningSeats: (u, c) => `${u} of ${c} seats`,
    eveningTeams: (n) => `${n} teams`,
    eveningNoTeam: "No team on this evening yet.",
    move: "Move to evening",
    moveFull: "That evening is full for that team. Move it anyway?",
    force: "Move Anyway",
    attend: "Attendance",
    attendHere: (n, o) => `${n} of ${o} present`,
    tick: "Mark Present",
    ticked: "Present",
    qrOpen: "Open the QR Screen",
    qrNote: "The QR is scanned at the door on the evening that team picked.",
    noEvenings: "No evenings yet. Make them from the Calendar or add one.",
    kumpul: "Submissions",
    parts: "Parts of the submission",
    partsEdit: "Edit Parts",
    partsHint: "File types and size limits. The biggest limit follows the file store.",
    partLabel: "Part name",
    partExt: "File types (comma separated)",
    partMb: "Limit (MB)",
    partReq: "Required",
    partLink: "A link may stand in",
    partAdd: "Add Part",
    partCap: (mb) => `Up to ${mb} MB`,
    allowedFiles: "File",
    status: {
      none: "Nothing yet",
      partial: "Partial",
      complete: "Complete",
      late: "Late, refused",
      over: "Ketua's OK",
    },
    view: "View",
    closeAt: (w) => `Closes ${w}`,
    openFile: "Download",
    openLink: "Open Link",
    override: "Allow a Late One",
    overrideTitle: "Allow a Late Submission",
    overrideBody:
      "This team may send even though the submission is closed. The reason is required and logged under your name.",
    overrideNote: "Reason",
    overrideNoteHint: "E.g. laptop broken for two days, official repair.",
    overrideUntil: "Allowed until",
    overrideNone: "No time limit",
    overrideSave: "Allow",
    overrideClear: "Withdraw the OK",
    overrideBy: (b) => `Allowed by ${b}`,
    overrideOnly: "Only the Ketua gives this OK.",
    noFiles: "Nothing sent yet.",
    order: "Presentation Order",
    tables: "Tables",
    tablesMake: "Make Tables",
    tablesCount: "Number of tables",
    tablesWarn: "Making the tables again removes the order and the examiners of the old ones.",
    deal: "Deal the Order",
    dealAsk: "Deal every team again at random? The current order is replaced.",
    table: (n) => n,
    turn: (n) => `Turn ${n}`,
    up: "Move up",
    down: "Move down",
    toTable: "Move to table",
    unplaced: (n) => `${n} teams have no table`,
    place: "Put on a table",
    emptyTable: "No team on this table yet.",
    examiners: "Table examiners",
    examinersHint: "Set the examiners of each table with the examiner Plotting below.",
    rubricNote: "The rubric rows are examples until the Akademik replaces them in the Rubric tab.",
    noTables: "No tables yet. Make them first.",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    done: "Done",
  },
};

const ZH: TubesWords = {
  err: {
    bukan_tahap: "你还没有进入 Tubes 阶段。",
    terkunci: "小组已锁定。需要修改请联系 Panitia。",
    sudah_punya_tim: "这个人已经有小组了。",
    belum_punya_tim: "你还没有小组。",
    bukan_pemimpin: "只有组长可以这样做。",
    penuh: "已满。",
    lewat: "已过期限。晚次可在前一天 23:59 之前更改。",
    belum_buka: "还没开放。第一个工作晚上开始提交。",
    tutup: "提交已截止。",
    nim_tidak_ada: "这个 NIM 不在 Tubes。",
    sudah_diundang: "已经邀请过，或已在这个小组。",
    tidak_ada_undangan: "邀请已经不在了。",
    ukuran_tim: "小组人数还不符合要求。",
    bagian_salah: "没有这个部分。",
    ekstensi: "这个部分不接受这种文件。",
    terlalu_besar: "文件太大。",
    kosong: "文件是空的。",
    link_salah: "链接必须以 https:// 开头且不含空格。",
    berkas_hilang: "文件没有到达服务器，请重新发送。",
    berkas_beda: "到达的文件不一致，请重新发送。",
    belum_diatur: "文件存储尚未设置，请联系 Panitia。",
    topik_penuh: "题目还不能发布。",
    tidak_ada: "找不到。",
    offline: "没有连接，请重试。",
    lain: "失败，请重试。",
    tanpa_hak: "你没有这个权限。",
    data_salah: "填写有误。",
    sudah_ada: "已经存在。",
    sudah_diurutkan: "这个小组已有答辩顺序。",
    tidak_ditemukan: "找不到。",
  },
  caas: {
    title: "Tubes",
    lede: "和小组一起完成一个项目，提交后进行答辩。",
    step: { team: "小组", evening: "工作晚次", topic: "题目", submit: "提交", turn: "答辩" },
    noTeam: "你还没有小组",
    noTeamBody: (min, max) =>
      `Tubes 以 ${min} 到 ${max} 人的小组完成。建立小组并用 NIM 邀请朋友，或接受别人的邀请。`,
    make: "建立小组",
    invitesTitle: "给你的邀请",
    inviteFrom: (l, s, m) => `${l} 邀请了你 · ${s}/${m} 人`,
    accept: "接受",
    decline: "拒绝",
    members: (n, min, max) => `${n} 人 · 至少 ${min}，最多 ${max}`,
    leader: "组长",
    you: "你",
    waiting: "等待回复",
    invite: "邀请朋友",
    inviteTitle: "邀请朋友加入小组",
    inviteBody: "填写朋友的 NIM。只有已进入 Tubes 且没有小组的 CaAs 可以被邀请。",
    nim: "NIM",
    nimHint: "例如 1301234567",
    send: "发送邀请",
    cancelInvite: "取消",
    kick: "移出",
    leave: "退出小组",
    leaveAsk: "退出这个小组？小组未锁定前你还可以被再次邀请。",
    disband: "解散小组",
    disbandAsk: "解散小组？所有成员都会变成没有小组。",
    rename: "改名",
    renameTitle: "小组名称",
    teamName: "小组名称",
    save: "保存",
    cancel: "取消",
    close: "关闭",
    tooFew: (min) => `人数不足。至少需要 ${min} 人才能选择晚次。`,
    tooMany: (max) => `小组超过 ${max} 人，Panitia 会处理。`,
    locked: "小组已锁定",
    lockedAt: (w) => `自 ${w} 起锁定。需要修改请联系 Panitia。`,
    lockSoon: (w) => `小组将在 Techmeet（${w}）锁定，请确认人员已齐。`,
    eveningNone: "还没选晚次",
    eveningBody: "为小组选一个晚上在 Lab IRIS 做 Tubes。当晚在门口扫 QR 签到。",
    eveningPick: "选择晚次",
    eveningChange: "更换晚次",
    eveningTitle: "选择工作晚次",
    eveningLede: "整个小组一个晚上。座位按人数计算。",
    eveningSeats: (l, c) => `剩 ${l} 个座位，共 ${c}`,
    eveningFull: "对你的小组已满",
    eveningPast: "已过期限",
    eveningMine: "你们小组的晚次",
    eveningMembersWait: "由组长选择晚次，你会在这里看到。",
    eveningNeedTeam: "先把小组凑齐，再选晚次。",
    eveningCutoff: "可更改到前一天 23:59。",
    eveningQr: "当晚在 Lab IRIS 扫 QR 签到。",
    eveningCame: "你已记录出席。",
    eveningNotYet: "出席在当晚通过 QR 记录。",
    confirm: "选这一晚",
    noEvenings: "Panitia 还没有开放工作晚次。",
    topicSoon: (w) => `题目将在 Techmeet（${w}）发布。`,
    topicWait: "你们小组的题目已定但尚未发布，发布后会在这里显示。",
    topicNone: "你们小组还没有题目。",
    topicBrief: "说明",
    submitTitle: "提交",
    submitBody: "整个小组共用一份提交。小组任何人都可以发送或替换。",
    submitNotYet: (w) => `提交在第一个工作晚上（${w}）开放。`,
    closesIn: "答辩开始时截止",
    closedLate: "提交已截止。逾期文件不接受，除非 Ketua 允许。",
    overridden: (u) => `Ketua 允许这个小组提交${u ? `，直到 ${u}` : ""}。`,
    overrideNote: "Ketua 的备注",
    partEmpty: "还没有",
    partNeeded: "必填",
    partOptional: "可以留空",
    sendFile: "发送",
    replace: "替换",
    remove: "删除",
    open: "打开",
    limit: (e, mb) => `${e}，最大 ${mb} MB`,
    pickFile: "选择文件",
    uploading: (p) => `发送中 ${p}%`,
    sentOk: "已发送。",
    removedOk: "已删除。",
    asLink: "用链接",
    asFile: "上传文件",
    linkLabel: "视频链接",
    linkHint: "https://...（YouTube、Drive 等，请确认 Panitia 能打开）",
    linkSave: "保存链接",
    status: {
      none: "还没有",
      partial: "部分",
      complete: "完整",
      late: "逾期，被拒",
      over: "Ketua 许可",
    },
    by: (n) => `由 ${n}`,
    turnTitle: "答辩",
    turnNone: "你们小组的答辩顺序还没有安排，Panitia 会分配。",
    turnBody: (t, a) => `${t}，大约 ${a} 开始`,
    next: {
      team: "建立或加入一个小组。",
      evening: "选择小组的工作晚次。",
      topic: "等待你们小组的题目发布。",
      submit: "完成项目并在答辩前提交。",
      turn: "准备好你的答辩。",
      done: "都准备好了，只剩答辩。",
    },
    loading: "加载中",
  },
  panel: {
    title: "Tubes",
    sections: { topik: "题目与说明", tim: "小组与晚次", kumpul: "提交", presentasi: "答辩" },
    sub: { order: "顺序", mine: "我的桌", nilai: "成绩", template: "评分标准" },
    locked: "已锁定",
    open: "开放",
    mode: "题目分配方式",
    modeSet: "由 Akademik 指定",
    modeDraw: "Techmeet 当场抽签",
    teamSize: "每组人数",
    teamMin: "至少",
    teamMax: "最多",
    publishTitle: "在 Techmeet 发布",
    published: "已发布",
    draft: "草稿",
    publishBody: (w) => `${w}。发布后每个小组只看到自己的题目。`,
    publishDrawn: "小组被抽到后，题目立即显示在该组页面。",
    publishNow: "立即发布",
    withdraw: "撤回",
    publishWait: (u, o) =>
      `${u > 0 ? `${u} 个小组没有题目。` : ""}${o > 0 ? `${o} 个题目超出名额。` : ""}解决后才能发布。`,
    addTopic: "添加题目",
    editTopic: "修改题目",
    shareEvenly: "平均分配",
    topicExample: "未替换前，下面的题目只是示例。",
    topicExampleTag: "示例",
    topicTitle: "标题",
    topicBrief: "给小组的说明",
    topicCap: "此题目最多几组",
    topicSave: "保存题目",
    topicDelete: "删除",
    topicTeams: (n, c) => `${n}/${c} 组`,
    topicWho: "谁得到这个题目",
    topicNone: "没有题目",
    topicSet: "题目",
    drawScreen: "抽签屏幕",
    drawTitle: "题目抽签屏幕",
    drawLede: "在 Techmeet 使用。小组依次抽签，抽到后题目才显示在该组页面。",
    drawNext: "下一个",
    drawNow: "正在抽签",
    drawDone: "所有小组都已抽签",
    spin: "转动",
    spinning: "转动中",
    drawAll: "一次全部抽完",
    drawRestart: "重新抽签",
    drawn: (n, t) => `已抽 ${n}/${t} 组`,
    noTopics: "还没有题目，请先添加。",
    topicsHint: "只有 Akademik 能修改题目，你可以阅读。",
    teams: "小组",
    teamsOf: (n) => `${n} 组`,
    unteamed: (n) => `${n} 位 CaAs 没有小组`,
    makeTeams: "自动分组",
    makeTeamsBody: (n, min, max) =>
      `把 ${n} 位没有小组的 CaAs 随机分成 ${min} 到 ${max} 人的小组。`,
    lockTeams: "立即锁定小组",
    unlockTeams: "解除锁定",
    lockAuto: "按时间：Techmeet 时锁定",
    lockForced: (m) => `Panitia 设定：${m}`,
    addMember: "添加成员",
    removeMember: "移出",
    makeLeader: "设为组长",
    disband: "解散",
    disbandAsk: "解散这个小组？成员会变成没有小组。",
    newTeam: "新小组",
    renameTeam: "改名",
    size: (n) => `${n} 人`,
    tooFew: "低于最低人数",
    tooMany: "超过上限",
    noTeamYet: "还没有小组。",
    evenings: "工作晚次",
    eveningAdd: "添加晚次",
    eveningEdit: "修改晚次",
    eveningSeed: "按日历生成",
    eveningSeedBody: "为 Pengerjaan 活动的每一天生成一个晚次，设定每晚座位数。",
    eveningDate: "日期",
    eveningFrom: "开始",
    eveningTo: "结束",
    eveningCap: "座位（人）",
    eveningPlace: "地点",
    eveningSeats: (u, c) => `${u}/${c} 个座位`,
    eveningTeams: (n) => `${n} 组`,
    eveningNoTeam: "这一晚还没有小组。",
    move: "移到晚次",
    moveFull: "那一晚对该小组已满，仍要移动吗？",
    force: "仍然移动",
    attend: "出席",
    attendHere: (n, o) => `${n}/${o} 已到`,
    tick: "标记出席",
    ticked: "已到",
    qrOpen: "打开 QR 屏幕",
    qrNote: "QR 在小组所选的那个晚上于门口扫描。",
    noEvenings: "还没有晚次。请按日历生成或添加一个。",
    kumpul: "提交",
    parts: "提交的部分",
    partsEdit: "设置部分",
    partsHint: "文件类型和大小上限。最大上限取决于文件存储。",
    partLabel: "部分名称",
    partExt: "文件类型（逗号分隔）",
    partMb: "上限（MB）",
    partReq: "必填",
    partLink: "可用链接代替",
    partAdd: "添加部分",
    partCap: (mb) => `最大 ${mb} MB`,
    allowedFiles: "文件",
    status: {
      none: "还没有",
      partial: "部分",
      complete: "完整",
      late: "逾期，被拒",
      over: "Ketua 许可",
    },
    view: "查看",
    closeAt: (w) => `${w} 截止`,
    openFile: "下载",
    openLink: "打开链接",
    override: "允许补交",
    overrideTitle: "允许逾期提交",
    overrideBody: "即使提交已截止，这个小组也可以发送。必须写原因，并记在你的名下。",
    overrideNote: "原因",
    overrideNoteHint: "例如：笔记本坏了两天，官方维修。",
    overrideUntil: "允许到",
    overrideNone: "不限时间",
    overrideSave: "允许",
    overrideClear: "撤销许可",
    overrideBy: (b) => `由 ${b} 许可`,
    overrideOnly: "只有 Ketua 能给出许可。",
    noFiles: "还没有发送任何内容。",
    order: "答辩顺序",
    tables: "桌",
    tablesMake: "建立桌",
    tablesCount: "桌数",
    tablesWarn: "重新建立桌会删除旧桌的顺序和考官。",
    deal: "分配顺序",
    dealAsk: "把所有小组重新随机分配？当前顺序会被取代。",
    table: (n) => n,
    turn: (n) => `第 ${n} 位`,
    up: "上移",
    down: "下移",
    toTable: "移到桌",
    unplaced: (n) => `${n} 个小组还没有桌`,
    place: "放到桌上",
    emptyTable: "这张桌还没有小组。",
    examiners: "桌的考官",
    examinersHint: "在下方的考官安排中设置每张桌的考官。",
    rubricNote: "评分行在 Akademik 替换前只是示例，可在“评分标准”页签修改。",
    noTables: "还没有桌，请先建立。",
    save: "保存",
    cancel: "取消",
    close: "关闭",
    done: "完成",
  },
};

export const TUBES = dict({ id: ID, en: EN, zh: ZH });
