/**
 * Perburuan LoRa IRIS - bilingual strings.
 *
 * The practicum runs in Indonesian, so `id` is the default and `en` exists so
 * the English journal track has a dashboard that matches its own wording.
 * There is one table rather than two builds: a projector in a lab that is
 * switching languages mid-session should not have to reload a different URL.
 *
 * Any element carrying data-i18n="key" gets its text replaced on switch, so
 * static markup in shell.html needs no JS of its own. Strings built at render
 * time call I18N.t(key) directly.
 *
 * window.I18N = { t, lang, set, onChange, apply, jarak, jarakBagian, rentang }
 */
(function () {
  "use strict";

  var STORE_KEY = "iris_hunt_lang";

  var STRINGS = {
    id: {
      "brand": "Perburuan LoRa",
      "nav.hunt": "Perburuan",
      "nav.layers": "Lapisan",

      "status.live": "Tersambung",
      "status.reconnecting": "Menyambung ulang",
      "status.offline": "Terputus",

      "hunt.eyebrow": "Modul 4",
      "hunt.title": "Perburuan LoRa",
      "hunt.lede": "Tiap kelompok memburu targetnya sendiri, disembunyikan sendiri-sendiri. Papan ini menunjukkan seberapa dekat kalian dengan target kalian sendiri, bukan peringkat melawan kelompok lain.",
      "hunt.empty": "Menunggu hunter tersambung…",

      "hud.elapsed": "Waktu berjalan",
      "hud.beacon": "Beacon",
      "hud.packets": "Paket dipancarkan",
      "hud.radio": "Radio",
      "hud.reset": "Ronde baru",
      "hud.beaconOn": "Memancar",
      "hud.beaconOff": "Hening",
      "hud.found": "%s/%s ditemukan",

      "card.group": "Kelompok",
      "card.smoothed": "RSSI halus",
      "card.distance": "Perkiraan jarak",
      "card.calibrate": "Kalibrasi 1 m",
      "card.raw": "RSSI mentah",
      "card.best": "Terbaik",
      "card.snr": "SNR",
      "card.loss": "Paket hilang",
      "card.delay": "Delay satu arah",
      "card.confirm": "Konfirmasi temuan",
      "card.found": "Menemukan beacon",
      "card.lost": "Sinyal hilang",

      "heat.membara": "MEMBARA",
      "heat.panas": "PANAS",
      "heat.hangat": "HANGAT",
      "heat.sejuk": "SEJUK",
      "heat.dingin": "DINGIN",
      "heat.hilang": "HILANG",

      "trend.closer": "mendekat",
      "trend.further": "menjauh",
      "trend.flat": "tetap",

      "layers.eyebrow": "Bagaimana data itu sampai",
      "layers.title": "Lapisan",
      "layers.lede": "Satu pembacaan RSSI menempuh lima lapisan sebelum muncul sebagai angka di layar ini. Pilih kelompok untuk melihat nilai aslinya.",
      "layers.empty": "Belum ada kelompok yang melapor.",
      "layers.application": "Aplikasi",
      "layers.transport": "Transport",
      "layers.network": "Jaringan",
      "layers.datalink": "Data-link",
      "layers.physical": "Fisik",
      "layers.applicationNote": "Peringkat dan keadaan panas-dingin yang dihitung papan skor.",
      "layers.transportNote": "Satu koneksi WebSocket di atas TCP, dibuka sejak hunter menyala.",
      "layers.networkNote": "Alamat IP dari DHCP Orange Pi, satu lompatan ke gerbangnya.",
      "layers.datalinkNote": "Nomor paket LoRa dan berapa yang tidak pernah sampai.",
      "layers.physicalNote": "Gelombang radio itu sendiri: frekuensi, pelebaran, dan kekuatannya.",
      "layers.estimate": "perkiraan",
      "layers.model": "model",
      "layers.modelNote": "Jarak di atas dihitung dari RSSI dengan model log-distance, bukan diukur. Di dalam ruangan pantulan dinding menggeser RSSI belasan dB tanpa jarak berubah, jadi perlakukan angkanya sebagai rentang — dan ujilah dengan meteran pada soal 3 jurnal.",
      "layers.rank": "peringkat",
      "layers.of": "dari",
      "layers.open": "terbuka",
      "layers.gateway": "gerbang",
      "layers.hop": "1 lompatan",
      "layers.packet": "paket",
      "layers.lost": "hilang",
      "layers.sync": "sync word",
      "layers.arena": "arena",

      "nav.awards": "Penghargaan",
      "nav.assist": "Asisten",
      "hunt.others": "Kelompok lain",


      "login.eyebrow": "Sebelum mulai",
      "login.title": "Masukkan NIM kalian",
      "login.lede": "Papan ini mencari kelompok kalian sendiri dari daftar yang sudah diisi asisten. Cukup sekali di awal sesi.",
      "login.field": "NIM",
      "login.go": "Masuk",
      "login.watch": "Saya hanya menonton",
      "login.badFormat": "NIM berisi 4-20 huruf atau angka.",
      "login.unknown": "NIM ini tidak terdaftar di sesi yang sedang berjalan. Hubungi asisten.",
      "login.offline": "Papan skor sedang terputus. Coba lagi sebentar.",
      "login.timeout": "Papan skor tidak menjawab. Coba lagi.",
      "login.session": "Sesi %s sedang berjalan.",
      "login.noSession": "Belum ada sesi yang berjalan. Tunggu asisten membukanya.",
      "login.err.nim_cacat": "NIM berisi 4-20 huruf atau angka.",
      "login.err.tak_ada_sesi": "Belum ada sesi yang berjalan. Tunggu asisten membukanya.",
      "login.err.tak_terdaftar": "NIM ini tidak terdaftar di sesi yang sedang berjalan. Hubungi asisten.",
      "login.err.terlalu_sering": "Terlalu banyak percobaan. Hubungi asisten.",
      "login.confirmLede": "Pastikan dulu sebelum lanjut.",
      "login.with": "bersama",
      "login.affirm": "Ya, ini kami",
      "login.deny": "Bukan kami",
      "login.welcome": "Selamat berburu, Kelompok %s",
      "login.rolled": "Sesi berganti. Masuk lagi dengan NIM kalian.",

      "paste.noGroup": "Baris %s: belum ada kelompok yang dibuka dengan #",
      "paste.badLine": "Baris %s: bukan NIM dan nama",
      "paste.dupNim": "NIM %s muncul dua kali",

      "whoami.title": "Keluar dari kelompok?",
      "whoami.lede": "Kalian harus memasukkan NIM lagi untuk kembali.",
      "whoami.note": "Klaim yang sudah dikirim tetap tercatat atas nama kelompok yang lama.",
      "whoami.stay": "Tetap di sini",
      "whoami.switch": "Keluar",

      "claim.button": "Kami menemukannya",
      "claim.armed": "Kalian sudah sangat dekat. Foto beacon-nya untuk mengajukan klaim.",
      "claim.title": "Ajukan temuan",
      "claim.lede": "Fotokan beacon yang kalian pegang. Asisten akan meninjaunya dari ruang praktikum.",
      "claim.hint": "Usahakan papan dan antenanya terlihat jelas.",
      "claim.takePhoto": "Ambil foto",
      "claim.retake": "Ganti foto",
      "claim.shrinking": "Mengecilkan foto\u2026",
      "claim.ready": "Siap dikirim (%s)",
      "claim.send": "Kirim klaim",
      "claim.cancel": "Batal",
      "claim.sending": "Mengirim foto\u2026",
      "claim.sent": "Klaim terkirim. Menunggu asisten.",
      "claim.sentNoPhoto": "Klaim terkirim tanpa foto.",
      "claim.uploadFailed": "Foto gagal dikirim.",
      "claim.timeout": "Server tidak menjawab. Coba lagi.",
      "claim.offline": "Tidak tersambung ke papan skor.",
      "claim.tooBig": "Foto masih terlalu besar.",
      "claim.rejected": "Klaim ditolak.",
      "claim.inReview": "Klaim kalian sedang ditinjau asisten.",
      "claim.wasRejected": "Klaim ditolak: %s",
      "claim.youWon": "Kalian memenangkan perburuan ini.",
      "claim.tooFar": "Belum cukup dekat \u2014 perkiraan %s",
      "claim.pending": "Klaim kalian sedang ditinjau.",
      "claim.won": "Kalian sudah menang.",
      "claim.lost": "Sinyal hilang. Dekati beacon lagi.",
      "claim.noData": "Papan kalian belum mengirim data.",

      "sense.off": "Detak jarak: mati",
      "sense.on": "Detak jarak: nyala",
      "sense.hint": "Makin dekat, makin rapat dan makin tinggi bunyinya. Mulai bergetar begitu kalian masuk HANGAT.",
      "sense.noAudio": "Peramban ini tidak mengizinkan bunyi. Getaran tetap jalan bila ponselnya mendukung.",
      "sense.silent": "Menunggu papan kalian mengirim sinyal.",

      "token.title": "Masuk sebagai asisten",
      "token.lede": "Tokennya tercetak di konsol Orange Pi saat server dinyalakan.",
      "token.hint": "Enam huruf dan angka. Huruf besar-kecil tidak dibedakan.",
      "token.enter": "Masuk",
      "token.cancel": "Batal",

      "assist.eyebrow": "Hanya asisten",
      "assist.title": "Asisten",
      "assist.lockedNote": "Papan ini terkunci. Tokennya tercetak di konsol Orange Pi saat server dinyalakan.",
      "assist.unlock": "Masukkan token",
      "assist.day": "Jadwal hari ini",
      "assist.dayLoading": "Mengambil jadwal\u2026",
      "assist.sesiN": "Sesi %s",
      "assist.startTime": "Jam mulai",
      "assist.ready": "Siap",
      "assist.running": "Sedang berjalan",
      "assist.runningLeft": "Berjalan \u00b7 sisa %s",
      "assist.pasteHint": "#1 Kelompok Alpha\n2311102001, Alya Rahmawati\n2311102014, Bagus Prasetyo",
      "assist.tally": "%s kelompok \u00b7 %s anggota \u00b7 %s galat",
      "assist.fixFirst": "Perbaiki dulu barisnya sebelum menyimpan.",
      "assist.saved": "Jadwal tersimpan.",
      "assist.startNow": "Mulai sekarang",
      "assist.startTitle": "Mulai sesi ini?",
      "assist.startLede": "Sesi %s akan langsung berjalan.",
      "assist.startNote": "Ronde yang sedang berjalan dihapus, termasuk seluruh foto klaim, dan semua ponsel harus masuk ulang.",
      "assist.endNow": "Akhiri sekarang",
      "assist.endTitle": "Akhiri sesi ini?",
      "assist.endLede": "Sesi %s akan ditutup.",
      "assist.endNote": "Perburuan, klaim, foto, dan penghargaan dihapus. Jadwal hari ini tetap tersimpan.",
      "assist.clearsIn": "Sesi %s dibersihkan dalam %s",
      "assist.noSession": "Belum ada sesi yang berjalan.",

      "assist.queue": "Klaim menunggu tinjauan",
      "assist.queueEmpty": "Belum ada klaim.",
      "assist.session": "Kendali",
      "assist.waiting": "menunggu %s",
      "assist.atClaim": "Saat mengklaim",
      "assist.attempt": "klaim ke-%s",
      "assist.noPhoto": "Tanpa foto.",
      "assist.approve": "Sahkan",
      "assist.reject": "Tolak",
      "assist.cancel": "Batal",
      "assist.close": "Tutup",
      "assist.approveTitle": "Sahkan pemenang?",
      "assist.approveLede": "Kelompok %s dinyatakan menemukan beacon.",
      "assist.approveNote": "Ini tidak dapat dibatalkan. Klaim kelompok lain yang masih menggantung akan ditutup.",
      "assist.rejectTitle": "Tolak klaim",
      "assist.rejectLede": "Kelompok %s akan kembali berburu.",
      "assist.reasonHint": "Alasan singkat",
      "assist.reasonWrong": "Itu bukan beacon-nya",
      "assist.reasonFar": "Masih terlalu jauh",
      "assist.reasonUnclear": "Fotonya tidak jelas",
      "assist.save": "Simpan",
      "assist.minutes": "menit",
      "assist.clear": "Hapus jadwal",
      "assist.clearTitle": "Hapus jadwal hari ini?",
      "assist.clearLede": "Keempat sesi beserta seluruh NIM, nama, dan foto klaim akan dibuang.",
      "assist.clearNote": "Tidak dapat dibatalkan. Asisten harus mengetik ulang daftar sehari penuh.",
      "assist.signout": "Keluar",
      "assist.resetTitle": "Mulai sesi baru?",
      "assist.resetLede": "Seluruh peringkat, klaim, dan foto ronde ini dibuang.",
      "assist.resetNote": "Nama anggota dan kalibrasi 1 meter tetap tersimpan.",

      "award.eyebrow": "Hasil perburuan",
      "award.title": "Penghargaan",
      "award.lede": "Menemukan beacon hanyalah salah satu ukuran. Tiga yang lain menilai cara berburunya, bukan hasil akhirnya.",
      "award.empty": "Belum ada yang bisa dinilai.",
      "award.champion": "Tercepat",
      "award.leader": "Tercepat sejauh ini",
      "award.provisional": "Sementara",
      "award.final": "Hasil akhir",
      "award.none": "Belum cukup data",
      "award.closer": "Pendekat tercepat",
      "award.closerNote": "Laju mendekat terbaik sepanjang sesi, diukur dari kenaikan RSSI pada jendela delapan detik.",
      "award.latency": "Tautan tercepat",
      "award.latencyNote": "Delay median terpendek dari papan ke papan skor -- ukuran mutu jaringan, berbeda dari seberapa dekat target masing-masing disembunyikan.",
      "award.link": "Tautan terandal",
      "award.linkNote": "Paket hilang paling sedikit. Kualitas tautan adalah ukuran yang berbeda dari kedekatan.",

      "stage.claiming": "mengklaim temuan",
      "stage.awaiting": "menunggu konfirmasi asisten",
      "heat.menunggu": "MENUNGGU",

      "found.title": "Beacon ditemukan",
      "found.by": "Kelompok",
      "found.in": "dalam",

      "toast.bergabung": "Kelompok %s bergabung",
      "toast.hilang": "Kelompok %s kehilangan sinyal",
      "toast.kembali": "Kelompok %s kembali",
      "toast.ditemukan": "Kelompok %s menemukan beacon",
      "toast.mulai": "Beacon mulai memancar",
      "toast.reset": "Sesi baru dimulai",
      "toast.beaconHening": "Beacon berhenti memancar",
      "toast.panas": "Kelompok %s memanas",
      "toast.kalibrasi": "Acuan 1 m dikalibrasi dari kelompok %s"
    },

    en: {
      "brand": "LoRa Hunt",
      "nav.hunt": "Hunt",
      "nav.layers": "Layers",

      "status.live": "Connected",
      "status.reconnecting": "Reconnecting",
      "status.offline": "Disconnected",

      "hunt.eyebrow": "Module 4",
      "hunt.title": "LoRa Hunt",
      "hunt.lede": "Every group hunts its own target, hidden separately. This board shows how close you are to your own target, not a ranking against other groups.",
      "hunt.empty": "Waiting for hunters to connect…",

      "hud.elapsed": "Elapsed",
      "hud.beacon": "Beacon",
      "hud.packets": "Packets sent",
      "hud.radio": "Radio",
      "hud.reset": "New round",
      "hud.beaconOn": "Transmitting",
      "hud.beaconOff": "Silent",
      "hud.found": "%s/%s found",

      "card.group": "Group",
      "card.smoothed": "Smoothed RSSI",
      "card.distance": "Estimated distance",
      "card.calibrate": "Calibrate 1 m",
      "card.raw": "Raw RSSI",
      "card.best": "Best",
      "card.snr": "SNR",
      "card.loss": "Packets lost",
      "card.delay": "One-way delay",
      "card.confirm": "Confirm find",
      "card.found": "Found the beacon",
      "card.lost": "Signal lost",

      "heat.membara": "BURNING",
      "heat.panas": "HOT",
      "heat.hangat": "WARM",
      "heat.sejuk": "COOL",
      "heat.dingin": "COLD",
      "heat.hilang": "LOST",

      "trend.closer": "closing",
      "trend.further": "drifting",
      "trend.flat": "steady",

      "layers.eyebrow": "How the reading gets here",
      "layers.title": "Layers",
      "layers.lede": "One RSSI reading crosses five layers before it appears as a number on this screen. Pick a group to see its real values.",
      "layers.empty": "No group has reported yet.",
      "layers.application": "Application",
      "layers.transport": "Transport",
      "layers.network": "Network",
      "layers.datalink": "Data link",
      "layers.physical": "Physical",
      "layers.applicationNote": "The rank and heat state the scoreboard computes.",
      "layers.transportNote": "One WebSocket over TCP, open since the hunter powered up.",
      "layers.networkNote": "An IP address from the Orange Pi's DHCP, one hop to its gateway.",
      "layers.datalinkNote": "LoRa packet numbering, and how many never arrived.",
      "layers.physicalNote": "The radio wave itself: frequency, spreading and strength.",
      "layers.estimate": "estimated",
      "layers.model": "model",
      "layers.modelNote": "The distance above is computed from RSSI with a log-distance model, not measured. Indoors, wall reflections shift RSSI by tens of dB without the distance changing at all, so treat it as a range — and test it with a tape measure in journal question 3.",
      "layers.rank": "rank",
      "layers.of": "of",
      "layers.open": "open",
      "layers.gateway": "gateway",
      "layers.hop": "1 hop",
      "layers.packet": "packet",
      "layers.lost": "lost",
      "layers.sync": "sync word",
      "layers.arena": "arena",

      "nav.awards": "Awards",
      "nav.assist": "Assistant",
      "hunt.others": "Other groups",


      "login.eyebrow": "Before you start",
      "login.title": "Enter your student ID",
      "login.lede": "This board finds your own group from the list the assistant filled in. Once at the start of the session is enough.",
      "login.field": "Student ID",
      "login.go": "Sign in",
      "login.watch": "I am only watching",
      "login.badFormat": "A student ID is 4-20 letters or digits.",
      "login.unknown": "That student ID is not registered for the running session. Ask the assistant.",
      "login.offline": "The board is disconnected. Try again in a moment.",
      "login.timeout": "The board did not answer. Try again.",
      "login.session": "Session %s is running.",
      "login.noSession": "No session is running yet. Wait for the assistant to open one.",
      "login.err.nim_cacat": "A student ID is 4-20 letters or digits.",
      "login.err.tak_ada_sesi": "No session is running yet. Wait for the assistant to open one.",
      "login.err.tak_terdaftar": "That student ID is not registered for the running session. Ask the assistant.",
      "login.err.terlalu_sering": "Too many attempts. Ask the assistant.",
      "login.confirmLede": "Check before you continue.",
      "login.with": "with",
      "login.affirm": "Yes, that is us",
      "login.deny": "Not us",
      "login.welcome": "Good hunting, Group %s",
      "login.rolled": "The session changed. Sign in again with your student ID.",

      "paste.noGroup": "Line %s: no group opened with # yet",
      "paste.badLine": "Line %s: not a student ID and name",
      "paste.dupNim": "Student ID %s appears twice",

      "whoami.title": "Sign out of this group?",
      "whoami.lede": "You will have to enter your student ID again to come back.",
      "whoami.note": "Claims already sent stay recorded under the old group.",
      "whoami.stay": "Stay here",
      "whoami.switch": "Sign out",

      "claim.button": "We found it",
      "claim.armed": "You are very close. Photograph the beacon to submit a claim.",
      "claim.title": "Submit a find",
      "claim.lede": "Photograph the beacon you are holding. The assistant reviews it from the practicum room.",
      "claim.hint": "Try to get the board and its antenna clearly in frame.",
      "claim.takePhoto": "Take a photo",
      "claim.retake": "Retake",
      "claim.shrinking": "Shrinking the photo\u2026",
      "claim.ready": "Ready to send (%s)",
      "claim.send": "Send claim",
      "claim.cancel": "Cancel",
      "claim.sending": "Sending the photo\u2026",
      "claim.sent": "Claim sent. Waiting for the assistant.",
      "claim.sentNoPhoto": "Claim sent without a photo.",
      "claim.uploadFailed": "The photo could not be sent.",
      "claim.timeout": "The server did not answer. Try again.",
      "claim.offline": "Not connected to the scoreboard.",
      "claim.tooBig": "The photo is still too large.",
      "claim.rejected": "Claim rejected.",
      "claim.inReview": "Your claim is being reviewed by the assistant.",
      "claim.wasRejected": "Claim rejected: %s",
      "claim.youWon": "You won this hunt.",
      "claim.tooFar": "Not close enough yet \u2014 estimated %s",
      "claim.pending": "Your claim is under review.",
      "claim.won": "You have already won.",
      "claim.lost": "Signal lost. Move back toward the beacon.",
      "claim.noData": "Your board has not reported yet.",

      "sense.off": "Distance ticks: off",
      "sense.on": "Distance ticks: on",
      "sense.hint": "The closer you get, the faster and higher it ticks. It starts buzzing once you reach WARM.",
      "sense.noAudio": "This browser will not allow sound. Vibration still works if the phone supports it.",
      "sense.silent": "Waiting for your board to report.",

      "token.title": "Sign in as assistant",
      "token.lede": "The token is printed on the Orange Pi console when the server starts.",
      "token.hint": "Six letters and digits. Case does not matter.",
      "token.enter": "Sign in",
      "token.cancel": "Cancel",

      "assist.eyebrow": "Assistants only",
      "assist.title": "Assistant",
      "assist.lockedNote": "This board is locked. The token is printed on the Orange Pi console when the server starts.",
      "assist.unlock": "Enter token",
      "assist.day": "Today's schedule",
      "assist.dayLoading": "Fetching the schedule\u2026",
      "assist.sesiN": "Session %s",
      "assist.startTime": "Start time",
      "assist.ready": "Ready",
      "assist.running": "Running",
      "assist.runningLeft": "Running \u00b7 %s left",
      "assist.pasteHint": "#1 Group Alpha\n2311102001, Alya Rahmawati\n2311102014, Bagus Prasetyo",
      "assist.tally": "%s groups \u00b7 %s members \u00b7 %s errors",
      "assist.fixFirst": "Fix the flagged lines before saving.",
      "assist.saved": "Schedule saved.",
      "assist.startNow": "Start now",
      "assist.startTitle": "Start this session?",
      "assist.startLede": "Session %s will begin immediately.",
      "assist.startNote": "The running round is wiped, claim photos included, and every phone has to sign in again.",
      "assist.endNow": "End now",
      "assist.endTitle": "End this session?",
      "assist.endLede": "Session %s will be closed.",
      "assist.endNote": "The hunt, claims, photos and awards are wiped. Today's schedule is kept.",
      "assist.clearsIn": "Session %s clears in %s",
      "assist.noSession": "No session is running yet.",

      "assist.queue": "Claims awaiting review",
      "assist.queueEmpty": "No claims yet.",
      "assist.session": "Controls",
      "assist.waiting": "waiting %s",
      "assist.atClaim": "At the claim",
      "assist.attempt": "attempt %s",
      "assist.noPhoto": "No photo.",
      "assist.approve": "Approve",
      "assist.reject": "Reject",
      "assist.cancel": "Cancel",
      "assist.close": "Close",
      "assist.approveTitle": "Approve the winner?",
      "assist.approveLede": "Group %s is declared to have found the beacon.",
      "assist.approveNote": "This cannot be undone. Any other pending claims are closed.",
      "assist.rejectTitle": "Reject the claim",
      "assist.rejectLede": "Group %s goes back to hunting.",
      "assist.reasonHint": "Short reason",
      "assist.reasonWrong": "That is not the beacon",
      "assist.reasonFar": "Still too far away",
      "assist.reasonUnclear": "The photo is unclear",
      "assist.save": "Save",
      "assist.minutes": "minutes",
      "assist.clear": "Clear schedule",
      "assist.clearTitle": "Clear today's schedule?",
      "assist.clearLede": "All four sessions, every student ID and name, and every claim photo will be discarded.",
      "assist.clearNote": "This cannot be undone. The assistant would have to retype the whole day.",
      "assist.signout": "Sign out",
      "assist.resetTitle": "Start a new session?",
      "assist.resetLede": "Every ranking, claim and photo from this round is discarded.",
      "assist.resetNote": "Member names and the 1 m calibration are kept.",

      "award.eyebrow": "How the hunt ended",
      "award.title": "Awards",
      "award.lede": "Finding the beacon is only one measure. The other three judge how a group hunted, not how it finished.",
      "award.empty": "Nothing to judge yet.",
      "award.champion": "Fastest",
      "award.leader": "Fastest so far",
      "award.provisional": "Provisional",
      "award.final": "Final",
      "award.none": "Not enough data",
      "award.closer": "Fastest closer",
      "award.closerNote": "Best closing rate of the session, measured as RSSI gain over an eight-second window.",
      "award.latency": "Fastest link",
      "award.latencyNote": "Shortest median delay from board to scoreboard -- a measure of network quality, different from how close each target was hidden.",
      "award.link": "Most reliable link",
      "award.linkNote": "Fewest lost packets. Link quality is a different measure from proximity.",

      "stage.claiming": "is claiming the find",
      "stage.awaiting": "awaiting the assistant",
      "heat.menunggu": "PENDING",

      "found.title": "Beacon found",
      "found.by": "Group",
      "found.in": "in",

      "toast.bergabung": "Group %s joined",
      "toast.hilang": "Group %s lost signal",
      "toast.kembali": "Group %s is back",
      "toast.ditemukan": "Group %s found the beacon",
      "toast.mulai": "Beacon started transmitting",
      "toast.reset": "New session started",
      "toast.beaconHening": "Beacon stopped transmitting",
      "toast.panas": "Group %s is heating up",
      "toast.kalibrasi": "1 m reference calibrated from group %s"
    }
  };

  var lang = "id";
  var listeners = [];

  try {
    var saved = window.localStorage.getItem(STORE_KEY);
    if (saved === "id" || saved === "en") lang = saved;
  } catch (err) {
    // Private windows and blocked site data both throw here; the default
    // language is a perfectly good answer, so carry on.
  }

  // Extra arguments fill successive %s. The tally line under the paste box
  // needs three of them, and splitting one sentence into three keys would
  // hand the translator fragments whose word order they cannot change.
  function t(key, fill) {
    var table = STRINGS[lang] || STRINGS.id;
    var value = table[key];
    if (value === undefined) value = (STRINGS.id[key] !== undefined) ? STRINGS.id[key] : key;
    for (var i = 1; i < arguments.length; i++) {
      value = value.replace("%s", arguments[i]);
    }
    return value;
  }

  // -- jarak ----------------------------------------------------------------
  //
  // Satu tempat untuk seluruh papan, karena presisi sebuah jarak bergantung
  // pada besarnya sendiri. Model log-distance tidak pernah dapat membenarkan
  // angka 0,1 m pada perkiraan 400 m, dan di atas satu kilometer satuan meter
  // menjadi tidak terbaca sekilas. Pemisah desimalnya ikut bahasa yang sedang
  // dipakai: praktikan Indonesia menulis 1,3 dan bukan 1.3.

  function num(value, digits) {
    var s = value.toFixed(digits);
    return lang === "id" ? s.replace(".", ",") : s;
  }

  function jarakBagian(meter) {
    if (meter === null || meter === undefined) return { nilai: "—", satuan: "m" };
    if (meter >= 1000) return { nilai: num(meter / 1000, 1), satuan: "km" };
    if (meter >= 10) return { nilai: num(meter, 0), satuan: "m" };
    return { nilai: num(meter, 1), satuan: "m" };
  }

  function jarak(meter) {
    var part = jarakBagian(meter);
    return part.nilai === "—" ? "—" : part.nilai + " " + part.satuan;
  }

  function rentang(dekat, jauh) {
    if (dekat === null || dekat === undefined ||
        jauh === null || jauh === undefined) return "";
    // Satuannya diambil dari ujung terjauh dan ditulis sekali saja, supaya
    // rentangnya terbaca sebagai satu angka dan bukan sebagai dua angka.
    if (jauh >= 1000) return num(dekat / 1000, 1) + "–" + num(jauh / 1000, 1) + " km";
    if (jauh >= 10) return num(dekat, 0) + "–" + num(jauh, 0) + " m";
    return num(dekat, 1) + "–" + num(jauh, 1) + " m";
  }

  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    }
  }

  function set(next) {
    if (next !== "id" && next !== "en") return;
    if (next === lang) return;
    lang = next;

    try {
      window.localStorage.setItem(STORE_KEY, lang);
    } catch (err) {
      // Not being able to remember the choice is not a reason to refuse it.
    }

    document.documentElement.setAttribute("lang", lang);
    apply();
    for (var i = 0; i < listeners.length; i++) listeners[i](lang);
  }

  window.I18N = {
    t: t,
    apply: apply,
    set: set,
    lang: function () { return lang; },
    jarak: jarak,
    jarakBagian: jarakBagian,
    rentang: rentang,
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); }
  };
})();
