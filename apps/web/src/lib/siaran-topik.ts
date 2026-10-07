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
  "session:roster": ["roster"],
  "session:rosterslot": ["roster"],
  "session:praktikan": ["roster"],
  "session:susulan": ["roster", "sesi", "jadwal"],
  "session:tot": ["tot", "roster", "sesi"],
  "session:hadir": ["sesi", "roster"],
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
  "session:help": ["sesi"],
  "session:kit": ["sesi", "laporan"],
  "session:siarkan": ["sesi"],
  "session:tangkapan": ["tangkapan"],
  // Every 2 s per laptop while a port is open; the Asisten mirror polls.
  "session:cermin": [],
  // Every 1.5 s per laptop; the Live page polls.
  "session:telemetry": [],
  "session:seelabs": ["sesi", "bayar"],
  "session:kejadian": ["laporan"],
  "session:dokumen": ["laporan"],
  "session:feedback": ["umpan", "laporan"],
  "session:bayar": ["bayar"],
  session: ["sesi", "jadwal"],
  "auth:student": ["sesi"],
  "auth:assistant": [],
  "auth:logout": [],
  "auth:set-password": [],
  "auth:change-password": [],
  "auth:galat": [],
  "modul:cek": ["jawaban"],
  "modul:kode-simpan": ["kode"],
  "modul:kode-buang": ["kode"],
  "modul:kode-pulihkan": ["kode"],
  "modul:kode-terbit": ["kode", "jurnal"],
  "presentasi:token": [],
  "presentasi:lampiran-token": [],
  "presentasi:simpan": ["presentasi"],
  "presentasi:tautan": ["presentasi"],
  "presentasi:aktifkan": ["presentasi"],
  "presentasi:nonaktifkan": ["presentasi"],
  "presentasi:hapus": ["presentasi"],
  "presentasi:schematic-token": [],
  "presentasi:schematic-save": ["presentasi"],
  "presentasi:schematic-link": ["presentasi"],
  "presentasi:schematic-activate": ["presentasi"],
  "presentasi:schematic-default": ["presentasi"],
  "presentasi:schematic-delete": ["presentasi"],
  // Register, edit, delete a Pi, a new token, and every queued command.
  server: ["server"],
  action: ["server"],
};

/** The topics a write sends, or null when it isn't listed above. */
export function topikUntuk(rute: string, aksi: unknown): readonly Topik[] | null {
  const kunci = typeof aksi === "string" && aksi ? `${rute}:${aksi}` : rute;
  return TOPIK_TULIS[kunci] ?? null;
}
