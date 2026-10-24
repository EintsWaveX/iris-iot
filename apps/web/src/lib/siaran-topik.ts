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
  // A Pi's Module 4 hunt summary changed (api/agent).
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
  // Oprec accounts (2026-10-24): a sign-up, sign-in or sign-out changes no
  // page but the candidate's own; Reset Akun answers its code to the one asking.
  "recruitment:account-signup": [],
  "recruitment:account-signin": [],
  "recruitment:account-signout": [],
  "recruitment:account-reset": [],
  // Register, edit, delete a Pi, a new token, and every queued command.
  server: ["server"],
  action: ["server"],
};

/** The topics a write sends, or null when it isn't listed above. */
export function topikUntuk(rute: string, aksi: unknown): readonly Topik[] | null {
  const kunci = typeof aksi === "string" && aksi ? `${rute}:${aksi}` : rute;
  return TOPIK_TULIS[kunci] ?? null;
}
