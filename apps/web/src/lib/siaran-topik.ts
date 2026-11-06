/**
 * Live updates, the shared list (2026-10-07): which topics exist, and which
 * of them every write sends. Both sides read this file: the API
 * (api/_lib/siaran.ts) to announce a write, and the pages (lib/siaran.ts)
 * to subscribe. The test api/_lib/__tests__/siaran-topik.test.ts fails when a
 * route grows an action that isn't listed here, so a new write can't go out
 * unheard again.
 *
 * Topic names must match the relay's /^[a-z]{2,16}$/ (apps/relay).
 */
export const TOPIK = [
  "akses",
  "brief",
  "jadwal",
  "roster",
  "tim",
  "sesi",
  "nilai",
  "laporan",
  "bayar",
  "umpan",
  "presentasi",
  "server",
  "jurnal",
  "online",
  "kode",
  "tot",
  // A Praktikan checked a blank (modul:cek): groupmates, the Asisten.
  "jawaban",
  // A journal capture was saved (session:tangkapan).
  "tangkapan",
  // A PC's Module 4 hunt summary changed (api/agent).
  "buru",
  // A group rewired its own pins in the running session (presentasi:pin-grup).
  "pingrup",
  // Phase 13: a TP file came in, a TP score, window or setting.
  "tp",
  // Phase 14: a SeeLabs robot job moved, an account connected, the robot's settings.
  "seelabs",
  // Phase 18: someone checked in, or a PJ changed a status or the slot's clock.
  "hadir",
  // Phase 23: the Lab Profile on Home (divisions, team photos, events).
  "profil",
  // Open Recruitment (2026-10-23). Letters only, the relay takes no hyphen:
  // the edition and the Panitia seats, the calendar, the candidates.
  "recedition",
  "reccalendar",
  "reccandidates",
  // S2 (2026-10-24): Cutting and the envelopes; Pilih Jadwal and the plotting board.
  // A QR scan or a hand mark rides reccandidates (the candidate list shows it).
  "reccutting",
  "recplotting",
  // S3 (2026-10-24): an exam room was set up, opened, run or finished. The
  // candidate's page shows or hides its test entry; the room list refreshes.
  "recroom",
  // S3 (2026-10-25): the question bank, the parts config or a reference changed.
  "recbank",
  // S3 (2026-10-25, Live Coding): a sheet was sent or withdrawn, or the topic pool, a template or the rubric changed.
  "reclive",
  // S3 (2026-10-25, scores): a question was voided or restored, scores were frozen or unfrozen. The Penilaian tab and the Cutting board's Tes Tulis columns follow.
  "recscore",
  // R4 and R6 (2026-11-01): the examiners of a slot, a sheet sent or taken back, a special case.
  "reciv",
  // The shared interview sheet was edited (iv-sheet-save): only an open sheet listens, so the
  // other examiner of the pair sees the answers appear while the CaAs is still in the chair.
  "recsheet",
  // Live Coding: a CaAs sent a run or submit, or a PC judged or compiled one. The judge tabs of the room refresh.
  "recjudge",
  // Tubes (R5, 2026-11-01): teams, topics, evenings, the submission and the Presentasi order. The CaAs's page and the Panitia board refetch on it.
  "rectubes",
  // R8 (2026-11-01): the final list, the codes, Jadikan Asisten, closing the edition.
  "recpn",
] as const;

export type Topik = (typeof TOPIK)[number];

/**
 * Writes, as "route:aksi" (or just "route"), and what they change. `[]`
 * means the write changes nothing another page shows, or only data a page
 * already polls fast as a device stream (Module 1 telemetry, the serial
 * mirror).
 */
export const TOPIK_TULIS: Readonly<Record<string, readonly Topik[]>> = {
  "session:akses": ["akses"],
  "session:final": ["akses"],
  "session:brief": ["brief"],
  "session:schedule": ["jadwal"],
  "session:jendela": ["jadwal"],
  "session:penugasan": ["jadwal", "tim"],
  "session:tim": ["tim", "jadwal"],
  "session:rosterslot": ["roster"],
  "session:praktikan": ["roster"],
  "session:susulan": ["roster", "sesi", "jadwal"],
  "session:tot": ["tot", "roster", "sesi", "jawaban", "tangkapan"],
  "session:hadir": ["sesi", "roster", "hadir", "jadwal"],
  "session:hadirku": ["hadir"],
  "session:group": ["sesi", "roster"],
  // Pegang Kelompok, Ganti Asisten: who holds a group decides who scores it
  // and what the projector and the group's Praktikan see.
  "session:assignment": ["sesi", "nilai"],
  "session:rekap": ["laporan"],
  "session:nilai": ["nilai"],
  "session:catatan": ["nilai"],
  "session:end": ["sesi", "jadwal", "laporan"],
  "session:cancel": ["sesi", "jadwal"],
  "session:lanjutkan": ["sesi"],
  "session:durasi": ["sesi"],
  "session:ubah": ["sesi", "jawaban", "tangkapan", "nilai"],
  "session:panggil": ["sesi"],
  "session:kit": ["sesi", "laporan"],
  "session:siarkan": ["sesi"],
  "session:tangkapan": ["tangkapan"],
  // Mulai/Selesai Perburuan (2026-10-08): the step opens, the hotspot chip moves.
  "session:perburuan": ["sesi", "buru", "server"],
  // Every 2 s per laptop while a port is open; the Asisten mirror polls.
  "session:cermin": [],
  // Every 1.5 s per laptop; the Live page polls.
  "session:telemetry": [],
  "session:seelabs": ["sesi", "bayar"],
  // Phase 14: connect, test, retry, token, Kelompok and Jaga pulls, the robot's switches.
  "session:robot": ["seelabs"],
  "session:kejadian": ["laporan"],
  "session:dokumen": ["laporan"],
  "session:feedback": ["umpan", "laporan"],
  "session:bayar": ["bayar"],
  // Deleting a semester's data by hand (2026-10-10) empties nearly every page.
  "session:retensi": [
    "sesi",
    "jadwal",
    "roster",
    "tim",
    "nilai",
    "laporan",
    "bayar",
    "umpan",
    "server",
    "jurnal",
    "jawaban",
    "tangkapan",
  ],
  session: ["sesi", "jadwal"],
  "auth:student": ["sesi"],
  "auth:assistant": [],
  "auth:logout": [],
  "auth:set-password": [],
  "auth:change-password": [],
  "auth:galat": [],
  "modul:cek": ["jawaban"],
  // The Konsol's Blank tab reads one group's blanks (GET).
  "modul:blank": [],
  "modul:matriks": [],
  "modul:kode-simpan": ["kode"],
  "modul:kode-buang": ["kode"],
  "modul:kode-pulihkan": ["kode"],
  "modul:kode-terbit": ["kode", "jurnal"],
  "presentasi:slides-token": [],
  "presentasi:lampiran-token": [],
  "presentasi:skema-bawaan": [],
  "presentasi:slides-save": ["presentasi"],
  "presentasi:slides-link": ["presentasi"],
  "presentasi:slides-assign": ["presentasi"],
  "presentasi:slides-delete": ["presentasi"],
  "presentasi:schematic-token": [],
  "presentasi:schematic-save": ["presentasi"],
  "presentasi:schematic-link": ["presentasi"],
  "presentasi:schematic-activate": ["presentasi"],
  "presentasi:schematic-default": ["presentasi"],
  "presentasi:schematic-delete": ["presentasi"],
  // A pin table changes every Pin dan Skema card and the served code.
  "presentasi:pin-simpan": ["presentasi"],
  // Only that group's cards and code follow; the module's pins stay.
  "presentasi:pin-grup": ["pingrup"],
  // Phase 13 (api/tp/[aksi].ts). A TP score also moves the session's TP
  // column; a Praktikan's typed answers are their own.
  "tp:nilai": ["tp", "nilai"],
  "tp:tanda": ["tp", "nilai"],
  "tp:telat": ["tp", "nilai"],
  "tp:jendela": ["tp"],
  "tp:paket": ["tp"],
  "tp:pilih": ["tp"],
  "tp:bawaan": ["tp"],
  "tp:kecuali": ["tp"],
  "tp:unggah": ["tp"],
  "tp:tiket": [],
  "tp:perpanjang": ["tp"],
  "tp:perpanjang-semua": ["tp"],
  // TP notices (2026-10-21): the Praktikan TP card and Kelola TP read them.
  "tp:kabar": ["tp"],
  "tp:kabar-hapus": ["tp"],
  "tp:kabar-oto": ["tp"],
  // The minute beat: the sync and the move broadcast what they change.
  "tp:detak": [],
  // Phase 23 (api/profil/[aksi].ts): every Home shows the Lab Profile.
  "profil:unggah": [],
  "profil:divisi-simpan": ["profil"],
  "profil:foto-asisten": ["profil"],
  "profil:nonaktif-daftar": [],
  "profil:tampil-asisten": ["profil"],
  "profil:bersama-simpan": ["profil"],
  "profil:bersama-hapus": ["profil"],
  "profil:acara-simpan": ["profil"],
  "profil:acara-hapus": ["profil"],
  // Open Recruitment (api/recruitment/[aksi].ts). The ticket only signs.
  "recruitment:ticket": [],
  "recruitment:apply": ["reccandidates"],
  "recruitment:document": ["reccandidates"],
  "recruitment:withdraw": ["reccandidates"],
  "recruitment:review": ["reccandidates"],
  "recruitment:event-save": ["reccalendar"],
  "recruitment:event-move": ["reccalendar"],
  "recruitment:event-delete": ["reccalendar"],
  "recruitment:seat": ["recedition"],
  "recruitment:unseat": ["recedition"],
  "recruitment:visibility": ["recedition", "reccalendar"],
  // Mode Latihan (recruitment-latihan.ts): the page reloads itself, nobody else needs a refetch.
  "recruitment:latihan-masuk": [],
  "recruitment:latihan-ganti": [],
  "recruitment:latihan-keluar": [],
  "recruitment:latihan-ulang": [],
  "recruitment:latihan-samakan": [],
  "recruitment:latihan-lompat": [],
  "recruitment:latihan-siapkan": [],
  // B0 (2026-10-28): an editable setting (documents, wording, Cutting start) is saved or put back to its default.
  "recruitment:setting-save": ["recedition"],
  "recruitment:setting-reset": ["recedition"],
  // S2: a proposal, a lock or unlock, an opened envelope; a scan or a hand mark; Pilih Jadwal.
  "recruitment:propose": ["reccutting"],
  "recruitment:lock": ["reccutting", "reccandidates"],
  "recruitment:unlock": ["reccutting", "reccandidates"],
  "recruitment:envelope-open": ["reccutting", "reccandidates"],
  "recruitment:attend": ["reccandidates"],
  "recruitment:attend-manual": ["reccandidates", "recroom"],
  // The QR wall's test mode: the test scans of one event removed (the wall's count and the Kehadiran list refresh)
  "recruitment:qr-test-reset": ["reccandidates", "recroom"],
  "recruitment:slot-pick": ["recplotting", "reccandidates"],
  "recruitment:slot-change": ["recplotting"],
  "recruitment:slot-decide": ["recplotting", "reccandidates"],
  "recruitment:slot-set": ["recplotting", "reccandidates", "reccalendar"],
  "recruitment:slot-autofill": ["recplotting", "reccandidates"],
  // S3, the exam (2026-10-24). Most writes ride the exam's relay room (the
  // Master's ping, notes, kits, answers) and send no topic. A room being set
  // up, run or moved sends recroom; the bank sends recbank, Live Coding
  // reclive and the scores recscore.
  "recruitment:test-checkin": [],
  "recruitment:test-answer": [],
  "recruitment:test-strike": [],
  "recruitment:test-submit": [],
  "recruitment:test-hotspot": [],
  "recruitment:test-bonus": [],
  "recruitment:lcc-send": ["recjudge"],
  "recruitment:lcc-flush": ["recjudge", "recscore"],
  "recruitment:lcc-bonus": [],
  "recruitment:lcc-done": [],
  "recruitment:exam-config-save": ["recbank"],
  "recruitment:question-save": ["recbank"],
  "recruitment:question-delete": ["recbank"],
  "recruitment:problem-save": ["recbank"],
  "recruitment:problem-check": ["recbank"],
  "recruitment:problem-delete": ["recbank"],
  "recruitment:problem-import": ["recbank"],
  "recruitment:bank-import": ["recbank"],
  "recruitment:media-ticket": [],
  "recruitment:bank-seed": ["recbank"],
  "recruitment:room-setup": ["recroom"],
  "recruitment:room-delete": ["recroom", "recplotting"],
  "recruitment:room-act": ["recroom"],
  "recruitment:room-master": [],
  "recruitment:room-note": [],
  "recruitment:room-kit": [],
  "recruitment:room-move": ["recroom"],
  "recruitment:question-void": ["recscore", "reccutting"],
  "recruitment:question-unvoid": ["recscore", "reccutting"],
  "recruitment:score-finalize": ["recscore", "reccutting"],
  "recruitment:score-unfreeze": ["recscore", "reccutting"],
  "recruitment:iv-crew-set": ["reciv", "recplotting"],
  "recruitment:iv-standin": ["reciv", "recplotting"],
  "recruitment:iv-sheet-save": ["recsheet"],
  "recruitment:iv-sheet-send": ["reciv", "reccutting"],
  "recruitment:iv-sheet-reopen": ["reciv", "reccutting"],
  "recruitment:iv-case": ["reciv", "reccutting", "recplotting"],
  "recruitment:ms-offer": ["recplotting", "reccutting", "reccandidates"],
  "recruitment:ms-record": ["recplotting", "reccutting", "reccandidates"],
  "recruitment:ms-retract": ["recplotting", "reccutting", "reccandidates"],
  "recruitment:ms-release": ["recplotting", "reccutting", "reccandidates"],
  "recruitment:ms-answer": ["recplotting", "reccutting"],
  "recruitment:pn-codes": ["recpn"],
  "recruitment:pn-confirm": ["recpn", "reccandidates", "reccutting", "recedition"],
  "recruitment:pn-close": ["recpn", "recedition"],
  // Oprec accounts (2026-10-24): a sign-up, sign-in or sign-out changes no
  // page but the candidate's own; Reset Akun answers its code to the one asking.
  "recruitment:account-signup": [],
  "recruitment:account-signin": [],
  "recruitment:account-signout": [],
  "recruitment:account-password": [],
  "recruitment:account-reset": [],
  // Tambah CaAs (2026-10-25): the Panitia add a candidate and their PDFs.
  "recruitment:candidate-add": ["reccandidates"],
  "recruitment:candidate-delete": ["reccandidates", "reccutting", "recplotting", "recroom"],
  "recruitment:candidate-note": ["reccandidates"],
  "recruitment:candidate-meta": ["reccandidates"],
  "recruitment:candidate-document-delete": ["reccandidates"],
  "recruitment:candidate-ticket": [],
  "recruitment:candidate-document": ["reccandidates"],
  // Tubes (R5)
  "recruitment:tubes-team-make": ["rectubes"],
  "recruitment:tubes-team-name": ["rectubes"],
  "recruitment:tubes-invite": ["rectubes"],
  "recruitment:tubes-invite-cancel": ["rectubes"],
  "recruitment:tubes-answer": ["rectubes"],
  "recruitment:tubes-leave": ["rectubes"],
  "recruitment:tubes-kick": ["rectubes"],
  "recruitment:tubes-disband": ["rectubes", "recplotting"],
  "recruitment:tubes-session-pick": ["rectubes"],
  "recruitment:tubes-file-ticket": [],
  "recruitment:tubes-file-save": ["rectubes"],
  "recruitment:tubes-file-delete": ["rectubes"],
  "recruitment:tubes-team-admin": ["rectubes", "recplotting"],
  "recruitment:tubes-team-auto": ["rectubes"],
  "recruitment:tubes-team-lock": ["rectubes"],
  "recruitment:tubes-topic-save": ["rectubes"],
  "recruitment:tubes-topic-delete": ["rectubes"],
  "recruitment:tubes-topic-set": ["rectubes"],
  "recruitment:tubes-topic-share": ["rectubes"],
  "recruitment:tubes-draw": ["rectubes"],
  "recruitment:tubes-draw-reset": ["rectubes"],
  "recruitment:tubes-publish": ["rectubes"],
  "recruitment:tubes-session-save": ["rectubes"],
  "recruitment:tubes-session-delete": ["rectubes"],
  "recruitment:tubes-session-seed": ["rectubes"],
  "recruitment:tubes-session-set": ["rectubes"],
  "recruitment:tubes-override": ["rectubes", "reccutting"],
  "recruitment:tubes-override-clear": ["rectubes", "reccutting"],
  "recruitment:tubes-tables-make": ["rectubes", "recplotting", "reciv"],
  "recruitment:tubes-order-deal": ["rectubes", "recplotting", "reciv"],
  "recruitment:tubes-order-set": ["rectubes", "recplotting", "reciv"],
  // Register, edit, delete a PC, a new token, and every queued command.
  server: ["server"],
  action: ["server"],
};

/** The topics a write sends, or null when it isn't listed above. */
export function topikUntuk(rute: string, aksi: unknown): readonly Topik[] | null {
  const kunci = typeof aksi === "string" && aksi ? `${rute}:${aksi}` : rute;
  return TOPIK_TULIS[kunci] ?? null;
}
