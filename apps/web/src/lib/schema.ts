/**
 * IRIS IoT practicum site — database schema (Drizzle, Postgres/Neon).
 *
 * Phase 1 (five tables: asisten, sesi, regu, praktikan, percobaanMasuk, audit)
 * plus Phase 2's server/device registry (server, denyut, perangkat, perintah).
 * The live IoT-layer X-ray and module content each get their own migration
 * when that phase is planned.
 *
 * Stage 21 retired `regu`/`praktikan` (renamed to `arsipRegu`/`arsipPraktikan`
 * below, near `kelompok`/`anggota` which superseded them) once the whole-
 * practicum roster made them dead weight -- see that pair's own docblock.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  serial,
  unique,
  uniqueIndex,
  index,
  jsonb,
  primaryKey,
  check,
  real,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { NILAI_KOMPONEN } from "./nilai-komponen.js";
import { KELAS } from "./kelas.js";
import type { StatusOrang, Tier } from "./hak.js";
import type { KodeBerkas } from "./kode-jurnal.js";
export { NILAI_KOMPONEN } from "./nilai-komponen.js";
export type { NilaiKomponen } from "./nilai-komponen.js";

export { KELAS } from "./kelas.js";

/**
 * The 25 lab assistants, seeded from Module - IRIS IoT/data_asisten.typ by
 * scripts/seed_asisten.py — never hand-edited. `nim` is the primary key
 * rather than a surrogate id because the handbook already treats it as the
 * unique identifier and nothing here needs a second one.
 *
 * Phone numbers and Line IDs from the source file are deliberately NOT
 * imported: nothing on this site has a legitimate reason to display them,
 * and importing data nobody reads is how a "closed" school project quietly
 * grows into a bigger privacy surface than it needs to be.
 */
export const asisten = pgTable("asisten", {
  nim: text("nim").primaryKey(),
  nama: text("nama").notNull(),
  kode: text("kode").notNull(),
  divisiId: text("divisi_id").notNull(),
  divisiEn: text("divisi_en").notNull(),
  // Null until the assistant completes the first-login set-password flow,
  // during which they still authenticate on the derived nim+"1715" scheme
  // (see auth.ts's header comment). Once set, this hash is the ONLY thing
  // checked for that assistant -- the derived scheme stops working for them
  // entirely, which is the point of moving off it.
  passwordHash: text("password_hash"),
  passwordDiaturPada: timestamp("password_diatur_pada", { withTimezone: true }),
  // Phase 9 roles (lib/hak.ts). The tier follows the position: it is
  // recomputed whenever a head role changes hands (jabatan_pemegang).
  /** ASO, ARD, ADS, ADC, AER or ARM; null for the Inti. */
  divisi: text("divisi"),
  tier: text("tier").$type<Tier>().notNull().default("asisten"),
  /** "dev" and/or "pencipta". */
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  status: text("status").$type<StatusOrang>().notNull().default("aktif"),
  /** The SeeLabs username. Never a password. */
  seelabsAkun: text("seelabs_akun"),
  /** An Admin's per-person overrides of single rights: { jadwal: true }. */
  hakOverride: jsonb("hak_override").$type<Record<string, boolean>>().notNull().default({}),
  /** Last seen with the app open (the signed-in page's /now poll, written at
   *  most once a minute); online while recent (lib/kehadiran.ts). */
  terakhirAktif: timestamp("terakhir_aktif", { withTimezone: true }),
});

/**
 * Who holds each of the ten head roles (lib/hak.ts KATEGORI), and since
 * when. One open row per role: the partial unique index makes a second
 * holder impossible, so whoever held it first keeps it until a handover
 * closes their row (selesai) and opens the next one in one transaction.
 * Division members have no row; their division is asisten.divisi.
 */
export const jabatanPemegang = pgTable(
  "jabatan_pemegang",
  {
    id: serial("id").primaryKey(),
    kategori: text("kategori").notNull(),
    nim: text("nim")
      .notNull()
      .references(() => asisten.nim),
    mulai: timestamp("mulai", { withTimezone: true }).notNull().defaultNow(),
    selesai: timestamp("selesai", { withTimezone: true }),
    /** NIM of whoever assigned it; null for the handbook import. */
    diberikanOleh: text("diberikan_oleh"),
  },
  (t) => [
    uniqueIndex("jabatan_pemegang_satu_pemegang")
      .on(t.kategori)
      .where(sql`${t.selesai} IS NULL`),
    index("jabatan_pemegang_nim").on(t.nim),
  ],
);

/**
 * A request to move a head role from its holder to someone else
 * ("Minta Serah Terima"). The holder or an Admin accepts or declines;
 * until then the holder keeps the role.
 */
export const serahTerima = pgTable(
  "serah_terima",
  {
    id: serial("id").primaryKey(),
    kategori: text("kategori").notNull(),
    dariNim: text("dari_nim").notNull(),
    keNim: text("ke_nim").notNull(),
    /** menunggu, diterima, ditolak or dibatalkan */
    status: text("status").notNull().default("menunggu"),
    dimintaOleh: text("diminta_oleh").notNull(),
    diputusOleh: text("diputus_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    diputusPada: timestamp("diputus_pada", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("serah_terima_satu_menunggu")
      .on(t.kategori)
      .where(sql`${t.status} = 'menunggu'`),
  ],
);

/**
 * One practicum session: a single module, on a single day, at a single
 * start time. Mirrors the shape apps/modul4/server.py already proved out for
 * Module 4 (JADWAL_MULAI, SESI_DURASI_SEC), generalised to any module so
 * the same table serves Modules 1-3 as well once their content phase lands.
 *
 * `mulaiPada`/`selesaiPada`/`durasiDetik` are the real lifecycle timestamps,
 * separate from `tanggal`/`mulai` (the *scheduled* date and clock time used
 * for the slot uniqueness check below) — a session that starts late or runs
 * over should never retroactively change which slot it occupied.
 *
 * The slot-uniqueness index is partial (`WHERE status <> 'batal'`) rather
 * than a plain UNIQUE, so cancelling a mis-created session frees its slot
 * for a replacement instead of leaving it permanently unusable — the
 * failure mode a plain unique constraint on this trio produced before.
 */
/** sesi.kit: the hand-over count of kits (one per group). */
export interface KitSesi {
  kembali: number;
  rusak: number;
  total: number;
  oleh: string;
  pada: string;
}

export const sesi = pgTable(
  "sesi",
  {
    id: serial("id").primaryKey(),
    tanggal: text("tanggal").notNull(), // ISO date, e.g. "2026-09-19"
    mulai: text("mulai").notNull(), // "HH:MM", local lab time
    modul: integer("modul").notNull(), // 1-4
    status: text("status", { enum: ["terjadwal", "berjalan", "selesai", "batal"] })
      .notNull()
      .default("terjadwal"),
    mulaiPada: timestamp("mulai_pada", { withTimezone: true }),
    selesaiPada: timestamp("selesai_pada", { withTimezone: true }),
    durasiDetik: integer("durasi_detik"),
    // Which of the practicum's four fixed daily starts (06:30, 09:30, 12:30,
    // 15:30) this session occupies -- 1-4. Nullable because Phase 1's manual
    // start form (still the only way to create a session before Stage 5's
    // scheduler) never asked for one; the scheduler will always set it.
    slot: integer("slot"),
    // True only for Module 4: the one part of the practicum that
    // needs the Orange Pi running as its own access point rather than as a
    // campus network client. A single wlan0 cannot be both at once (see
    // orangepi/README.md section 7.0's provisioning notes), so the
    // scheduler must know which slots need AP mode ahead of time rather
    // than leaving it to memory.
    butuhAp: boolean("butuh_ap").notNull().default(false),
    // Stage 10's broadcast: a short message pushed to every signed-in
    // praktikan via their existing 30-second /api/session/now poll. Lives
    // on the session itself (not its own table) since a broadcast only
    // ever means something in the context of the session it was sent
    // during, and clearing it is exactly "the session ended" -- no
    // separate cleanup path needed. pengumumanPada, not just pengumuman
    // being non-null, is what the student's poll compares against to
    // decide "have I already shown this one", so the same text sent twice
    // still surfaces as two toasts.
    pengumuman: text("pengumuman"),
    pengumumanPada: timestamp("pengumuman_pada", { withTimezone: true }),
    // Phase 8: which of the two class types this session teaches. It sets
    // the default UI language for everyone in it (reguler = Indonesian,
    // internasional = English); each person can still override their own.
    // Filled from the jadwal slot at start time, defaulting to reguler for
    // sessions created before the schedule existed.
    kelas: text("kelas", { enum: KELAS }).notNull().default("reguler"),
    // Phase 9: each session sets its own length (30 to 150 minutes; 150
    // leaves 30 minutes before the next slot) and group count (1 to 10).
    // A susulan (makeup) session is free of the schedule window; one made
    // by "Siapkan Sesi Berikutnya" points back at the session it carries
    // unfinished groups from. A susulan draft waits as status terjadwal.
    // A tot session (2026-10-05) is the Asisten's practice run with the
    // dummy Praktikan of Mode TOT (src/lib/tot.ts), kept out of pay,
    // SeeLabs and the real reports.
    durasiMenit: integer("durasi_menit").notNull().default(150),
    jenis: text("jenis", { enum: ["reguler", "susulan", "tot"] })
      .notNull()
      .default("reguler"),
    jumlahKelompok: integer("jumlah_kelompok").notNull().default(5),
    // Stage 6: when this session's pay units were last rebuilt (null: never).
    bayarSinkronPada: timestamp("bayar_sinkron_pada", { withTimezone: true }),
    lanjutanDari: integer("lanjutan_dari").references((): AnyPgColumn => sesi.id, {
      onDelete: "set null",
    }),
    // Phase 9 (c-next "Papan dan kit"): kits back and broken when the room
    // was handed over, of `total` (the session's group count).
    kit: jsonb("kit").$type<KitSesi>(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The same slot (module, day, start time) is never scheduled twice by
    // any session that isn't cancelled — this is what a re-submitted or
    // double-clicked "create session" form must fail against, rather than
    // silently producing a duplicate.
    uniqueIndex("sesi_slot_unik")
      .on(t.tanggal, t.modul, t.mulai)
      .where(sql`${t.status} <> 'batal'`),
    index("sesi_tanggal_idx").on(t.tanggal),
  ],
);

/**
 * The master roster's group list, scoped to the whole practicum rather than
 * to one session — this is what makes "one roster, four modules" possible.
 * `nomor` is the human-facing group number shown on the roster paste box and
 * the scoreboard.
 */
export const kelompok = pgTable("kelompok", {
  id: serial("id").primaryKey(),
  nomor: integer("nomor").notNull().unique(),
  nama: text("nama").notNull(),
  aktif: boolean("aktif").notNull().default(true),
  /** Phase 9: the group's KLP number in SeeLabs, copied from the slot
   *  roster when a session starts (see roster_kelompok). */
  klpSeelabs: text("klp_seelabs"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A student, belonging to exactly one group for the whole practicum.
 * `unique(nim)` is the schema's core invariant change from Phase 1's
 * `unique(tanggal, nim)` on `praktikan`: a NIM can no longer occupy a
 * different group on different days, which is what let the same roster
 * paste fail on every session after the first.
 */
export const anggota = pgTable("anggota", {
  id: serial("id").primaryKey(),
  kelompokId: integer("kelompok_id")
    .notNull()
    .references(() => kelompok.id, { onDelete: "cascade" }),
  nim: text("nim").notNull().unique(),
  nama: text("nama").notNull(),
});

/**
 * Per-session exclusions and role overrides on top of the master roster.
 * Sparse by design: a group with no row here is active with no special role
 * for that session, so excluding Module 4's beacon group is one row, not a
 * row for every other group saying "still active." This is also the first
 * thing in the codebase that actually writes `aktif` for a session — Phase
 * 1's `regu.aktif` was read at login but nothing ever set it to false.
 */
export const sesiKelompok = pgTable(
  "sesi_kelompok",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokId: integer("kelompok_id")
      .notNull()
      .references(() => kelompok.id, { onDelete: "cascade" }),
    aktif: boolean("aktif").notNull().default(true),
    peran: text("peran", { enum: ["beacon", "hunter"] }),
    catatan: text("catatan"),
    // Phase 8's "Minta bantuan" (raise hand): set by a praktikan of this
    // group, cleared by the praktikan (cancel) or any assistant (resolved).
    // A timestamp rather than a boolean so the board can show how long the
    // group has been waiting.
    mintaBantuanPada: timestamp("minta_bantuan_pada", { withTimezone: true }),
  },
  (t) => [unique("sesi_kelompok_unik").on(t.sesiId, t.kelompokId)],
);

/**
 * Phase 8: which assistant is responsible for which group in one session.
 * One row per (session, group); the same assistant may hold several groups
 * (the schedule has slots with fewer than five assistants, e.g. the
 * International class on Thursday slot 2 has three). The assigned assistant
 * is the only one who may write that group's scores; everyone else reads
 * them live. Prefilled from `jadwal` when the session starts, then changed
 * by claim / reassign / take over, each of which is audited.
 */
export const sesiAsisten = pgTable(
  "sesi_asisten",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokId: integer("kelompok_id")
      .notNull()
      .references(() => kelompok.id, { onDelete: "cascade" }),
    asistenNim: text("asisten_nim")
      .notNull()
      .references(() => asisten.nim, { onDelete: "cascade" }),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sesi_asisten_unik").on(t.sesiId, t.kelompokId)],
);

/**
 * Phase 8: one praktikan's feedback for one session, in the journal's two
 * sections (Asisten and Lab). `nim` is stored only to enforce one row per
 * student per session; it is never returned to an assistant. The Asisten
 * half is readable only by `asistenNim` (the assessed assistant); the Lab
 * half is readable by every assistant, in aggregate.
 */
export const umpanBalik = pgTable(
  "umpan_balik",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    asistenNim: text("asisten_nim")
      .notNull()
      .references(() => asisten.nim, { onDelete: "cascade" }),
    ratingAsisten: integer("rating_asisten").notNull(),
    komentarAsisten: text("komentar_asisten"),
    chipsAsisten: jsonb("chips_asisten").$type<string[]>().notNull().default([]),
    ratingLab: integer("rating_lab").notNull(),
    komentarLab: text("komentar_lab"),
    chipsLab: jsonb("chips_lab").$type<string[]>().notNull().default([]),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("umpan_balik_sesi_nim").on(t.sesiId, t.nim),
    index("umpan_balik_asisten_idx").on(t.asistenNim),
  ],
);

/**
 * Phase 8: the teaching schedule, imported by pasting the "JADWAL NGAJAR"
 * sheet. One row per scheduled slot in a semester; slots the sheet shades as
 * unavailable simply have no row. `asisten` is the default assistant codes
 * (asisten.kode) in group order, so the first code holds K1; `pengganti` is
 * the ranked substitute list, each with an optional informational tag
 * ("fit" = Ngajar FIT, "a24" = Angkatan 24; labels only, never a block).
 * `status` "segera" is a slot the sheet marks "Soon": shown, never prefilled.
 */
export const jadwal = pgTable(
  "jadwal",
  {
    id: serial("id").primaryKey(),
    semester: text("semester").notNull(), // e.g. "2026-ganjil"
    hari: integer("hari").notNull(), // 1 = Senin ... 6 = Sabtu
    slot: integer("slot").notNull(), // 1-4, see SLOT_MULAI
    kelas: text("kelas", { enum: KELAS }).notNull().default("reguler"),
    // Phase 9: "kosong" = no practicum in this slot all semester, shown in
    // the sheet's orange or red (warna_kosong; both mean the same). A
    // holiday is one date only (libur_tanggal), so it isn't a status.
    status: text("status", { enum: ["aktif", "segera", "kosong"] })
      .notNull()
      .default("aktif"),
    warnaKosong: text("warna_kosong", { enum: ["oranye", "merah"] }),
    liburTanggal: text("libur_tanggal"),
    asisten: jsonb("asisten").$type<string[]>().notNull().default([]),
    pengganti: jsonb("pengganti")
      .$type<{ kode: string; tag: "fit" | "a24" | null }[]>()
      .notNull()
      .default([]),
    // Phase 9: the slot's roster shape (Preparation) and its own start
    // window, minutes before the slot (5 to 30; null = the general default
    // in pengaturan "jendela_mulai_default").
    jumlahKelompok: integer("jumlah_kelompok").notNull().default(5),
    anggotaPerKelompok: integer("anggota_per_kelompok").notNull().default(4),
    jendelaMulaiMenit: integer("jendela_mulai_menit"),
    jendelaDiaturOleh: text("jendela_diatur_oleh"),
    diubahOleh: text("diubah_oleh"),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("jadwal_slot_unik").on(t.semester, t.hari, t.slot)],
);

/**
 * Phase 9 Stage 4: who teaches a slot on one date, beyond the semester's
 * default pairing in `jadwal.asisten`. One row per person per date:
 * - jenis "pengganti": covers a group this date (often for an izin);
 * - jenis "sukarela": a volunteer outside the schedule ("Saya Bantu");
 * - jenis "tetap": the slot's own Asisten, only when something about them
 *   is recorded for the date (hadir).
 * status: diminta (asked or offered, waiting), diterima, ditolak. A row with
 * no kelompok_nomor helps the slot without holding a group.
 */
export const penugasanSlot = pgTable(
  "penugasan_slot",
  {
    id: serial("id").primaryKey(),
    jadwalId: integer("jadwal_id")
      .notNull()
      .references(() => jadwal.id, { onDelete: "cascade" }),
    tanggal: text("tanggal").notNull(),
    kelompokNomor: integer("kelompok_nomor"),
    nim: text("nim")
      .notNull()
      .references(() => asisten.nim, { onDelete: "cascade" }),
    jenis: text("jenis", { enum: ["tetap", "pengganti", "sukarela"] }).notNull(),
    tag: text("tag", { enum: ["fit", "a24"] }),
    status: text("status", { enum: ["diminta", "diterima", "ditolak"] })
      .notNull()
      .default("diterima"),
    hadir: boolean("hadir"),
    masukPada: timestamp("masuk_pada", { withTimezone: true }),
    dimintaOleh: text("diminta_oleh").notNull(),
    dikonfirmasiOleh: text("dikonfirmasi_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("penugasan_slot_orang").on(t.jadwalId, t.tanggal, t.nim),
    index("penugasan_slot_tanggal_idx").on(t.tanggal),
  ],
);

/**
 * Phase 9 Stage 4: an Asisten excused from their slot on one date. While
 * `pengganti_nim` is null the group needs cover ("dicari" shows it to every
 * free Asisten in Saya Bantu).
 */
export const izin = pgTable(
  "izin",
  {
    id: serial("id").primaryKey(),
    nim: text("nim")
      .notNull()
      .references(() => asisten.nim, { onDelete: "cascade" }),
    jadwalId: integer("jadwal_id")
      .notNull()
      .references(() => jadwal.id, { onDelete: "cascade" }),
    tanggal: text("tanggal").notNull(),
    alasan: text("alasan"),
    status: text("status", { enum: ["aktif", "dicari", "dibatalkan"] })
      .notNull()
      .default("aktif"),
    penggantiNim: text("pengganti_nim"),
    dibuatOleh: text("dibuat_oleh").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("izin_satu").on(t.nim, t.jadwalId, t.tanggal)],
);

/**
 * One answer, keyed by session and group rather than by student or module —
 * by session so a makeup session repeating a module gets its own answer set
 * for free, and by group (not `anggota.id`) so removing a member never
 * cascades into answers. `soalKode` is the `kode` a journal's `#jawab()`
 * helper carries for an analysis answer (prose/diagram), or a code blank's
 * own module/file/number address once Stage 8's editor writes here too —
 * the single source both the PDF and this table's rows agree on. `versi` is
 * used for stale-write detection only (last-write-wins per row, not merged)
 * — see the Phase 3 plan's concurrency section for why a CRDT would solve a
 * collision five students in one room don't have.
 *
 * `benar`/`percobaan` exist for code blanks only (an analysis answer is
 * never "correct" in this sense; both stay at their defaults for those
 * rows) — `benar` is whether `isi` currently matches the stored answer,
 * `percobaan` counts every check attempt regardless of outcome, which is
 * what feeds Stage 10's "Perlu bantuan" stuck list.
 *
 * `sesiId` is nullable so Stage 8's editor works any time, no running
 * session required (practice at home, before or after a lab slot). A plain
 * multi-column unique constraint already treats every NULL as distinct from
 * every other NULL, so it does nothing to stop duplicate rows piling up for
 * the same group's home practice -- the second, partial index below is what
 * actually enforces "one row per group per code blank" in that case.
 */
export const jawaban = pgTable(
  "jawaban",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id").references(() => sesi.id, { onDelete: "cascade" }),
    kelompokId: integer("kelompok_id")
      .notNull()
      .references(() => kelompok.id, { onDelete: "cascade" }),
    soalKode: text("soal_kode").notNull(),
    isi: text("isi").notNull().default(""),
    benar: boolean("benar").notNull().default(false),
    percobaan: integer("percobaan").notNull().default(0),
    versi: integer("versi").notNull().default(0),
    diubahOleh: text("diubah_oleh"), // NIM, matching audit.aktorNim's shape
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("jawaban_sesi_kelompok_soal").on(t.sesiId, t.kelompokId, t.soalKode),
    uniqueIndex("jawaban_kelompok_soal_tanpa_sesi")
      .on(t.kelompokId, t.soalKode)
      .where(sql`${t.sesiId} is null`),
    index("jawaban_sesi_idx").on(t.sesiId),
  ],
);

/**
 * The assistant-uploaded presentation library (Stage 9). A small library
 * rather than a single replace-on-upload slot -- several PDFs can exist at
 * once, with at most one `aktif` at a time via the partial unique index
 * below (a partial unique index on a boolean filtered to `true` is exactly
 * "at most one row may have this true", the same idiom `sesi_slot_unik`
 * uses for its own exclusion rule). Not tied to any session or module: the
 * praktikan dashboard's presentation card always shows whichever one is
 * active, persisted for everyone rather than scoped to who happens to be
 * looking.
 */
export const presentasi = pgTable(
  "presentasi",
  {
    id: serial("id").primaryKey(),
    /** The module the deck belongs to; null for a deck from before decks
     *  went per module, waiting for an Asisten to give it one. */
    modul: integer("modul"),
    namaBerkas: text("nama_berkas").notNull(),
    url: text("url").notNull(), // Vercel Blob URL, or the Canva link (jenis tautan)
    /** Phase 9: an uploaded PDF (berkas) or a Canva view link (tautan). */
    jenis: text("jenis", { enum: ["berkas", "tautan"] })
      .notNull()
      .default("berkas"),
    diunggahOleh: text("diunggah_oleh").notNull(), // NIM, matching audit.aktorNim's shape
    diunggahPada: timestamp("diunggah_pada", { withTimezone: true }).notNull().defaultNow(),
    aktif: boolean("aktif").notNull().default(false),
  },
  // One active per module and kind, like skema: a PDF and a Canva link may
  // both be active, and the Praktikan switches between them.
  (t) => [
    uniqueIndex("presentasi_aktif_per_modul_jenis")
      .on(t.modul, t.jenis)
      .where(sql`${t.aktif} = true`),
  ],
);

/**
 * Assistant-uploaded wiring schematics (Phase 8), one small library per
 * module with the same shape and the same "at most one aktif" rule as
 * `presentasi` above, except that the rule is per module: the partial unique
 * index is on `modul` filtered to `aktif = true`. A module with no active
 * upload falls back to the schematic bundled with the site
 * (`public/schematics/Module N.png`), so an empty table is a valid state.
 */
export const skema = pgTable(
  "skema",
  {
    id: serial("id").primaryKey(),
    modul: integer("modul").notNull(),
    namaBerkas: text("nama_berkas").notNull(),
    url: text("url").notNull(), // Vercel Blob URL, or an embed link (jenis tautan)
    /** Phase 9: an uploaded image (berkas) or a Wokwi, Tinkercad or Canva
     *  link, or a direct image address (tautan), checked on save. */
    jenis: text("jenis", { enum: ["berkas", "tautan"] })
      .notNull()
      .default("berkas"),
    diunggahOleh: text("diunggah_oleh").notNull(),
    diunggahPada: timestamp("diunggah_pada", { withTimezone: true }).notNull().defaultNow(),
    aktif: boolean("aktif").notNull().default(false),
  },
  // One active per module and kind: an image and a link (a Wokwi project,
  // say) may both be active, and the Praktikan switches between them.
  (t) => [
    uniqueIndex("skema_aktif_per_modul_jenis")
      .on(t.modul, t.jenis)
      .where(sql`${t.aktif} = true`),
  ],
);

/**
 * Journal code, managed in the app by ASO and Admins (2026-10-05). One row
 * is one version of a module's code files: every file's complete id and en
 * text plus the shared blanks (src/lib/kode-jurnal.ts KodeBerkas[]). Per
 * module at most one draft (shared by every editor) and one published
 * version; publishing archives the previous one. A module with no published
 * row serves version 1 from the bundled files (api/_lib/kode-aktif.ts).
 */
export const kodeVersi = pgTable(
  "kode_versi",
  {
    id: serial("id").primaryKey(),
    modul: integer("modul").notNull(),
    /** Set on publish: 1, 2, 3 ... per module. Null while a draft. */
    nomor: integer("nomor"),
    status: text("status", { enum: ["draf", "terbit", "arsip"] }).notNull(),
    berkas: jsonb("berkas").$type<KodeBerkas[]>().notNull(),
    catatan: text("catatan"),
    dibuatOleh: text("dibuat_oleh").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    diubahOleh: text("diubah_oleh").notNull(),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
    terbitOleh: text("terbit_oleh"),
    terbitPada: timestamp("terbit_pada", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("kode_versi_nomor").on(t.modul, t.nomor),
    uniqueIndex("kode_versi_draf")
      .on(t.modul)
      .where(sql`${t.status} = 'draf'`),
    uniqueIndex("kode_versi_terbit")
      .on(t.modul)
      .where(sql`${t.status} = 'terbit'`),
  ],
);

/**
 * Frozen Phase 1 tables, retired by Stage 21: a per-session group/roster
 * pair superseded by the whole-practicum `kelompok`/`anggota` above once
 * migration 0002 landed. Migrations 0007/0008 create this archived pair
 * and drop the originals, rather than a true SQL rename -- drizzle-kit's
 * rename detection needs an interactive prompt this project's non-TTY
 * generate environment can't answer, so the two steps are separate
 * migrations instead. Equivalent to a rename here regardless, since
 * MIGRATIONS.md's 2026-09-22 note already confirms both tables were empty
 * in production and no code path has written to either since -- there is
 * no data a real rename would have preserved that this loses. Kept as real
 * Drizzle tables (rather than removed from this file entirely) purely so a
 * future `db:generate` diffs against their current shape instead of
 * proposing to drop them; nothing in the application queries either one
 * anymore.
 */
export const arsipRegu = pgTable(
  "arsip_regu",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    nomor: integer("nomor").notNull(),
    nama: text("nama").notNull(),
    aktif: boolean("aktif").notNull().default(true),
  },
  (t) => [unique("arsip_regu_nomor_per_sesi").on(t.sesiId, t.nomor)],
);

export const arsipPraktikan = pgTable(
  "arsip_praktikan",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    reguId: integer("regu_id")
      .notNull()
      .references(() => arsipRegu.id, { onDelete: "cascade" }),
    tanggal: text("tanggal").notNull(),
    nim: text("nim").notNull(),
    nama: text("nama").notNull(),
  },
  (t) => [
    unique("arsip_praktikan_nim_per_hari").on(t.tanggal, t.nim),
    index("arsip_praktikan_sesi_idx").on(t.sesiId),
  ],
);

/**
 * Every login attempt, successful or not. This is what a stateless HTTP
 * auth route uses for rate limiting where apps/modul4/server.py could just keep a
 * counter in memory per open WebSocket connection (MAX_GAGAL_TOKEN,
 * MAX_GAGAL_MASUK) — a serverless function has no connection to hang a
 * counter off, so the count has to live somewhere durable between
 * invocations. Rows older than a few minutes are irrelevant to any lockout
 * decision and may be deleted by a periodic cleanup once one exists; Phase 1
 * does not need one; the table is small.
 */
export const percobaanMasuk = pgTable(
  "percobaan_masuk",
  {
    id: serial("id").primaryKey(),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
    nim: text("nim").notNull(),
    ip: text("ip").notNull(),
    // "kode": a wrong session code (2026-10-07), kept apart so the code's
    // own two-tries lock counts only those (plain text column, no migration).
    jenis: text("jenis", { enum: ["asisten", "praktikan", "kode"] }).notNull(),
    berhasil: boolean("berhasil").notNull(),
    // P6.2 (0006, fixes B9): the session running at the moment of this
    // attempt, null when none was. This is what makes attendance for a
    // GIVEN session ("who actually logged in during session #42") answerable
    // directly, instead of the pre-0006 heuristic of "any successful
    // praktikan login since this session's start time" -- which double-
    // counted nobody but also couldn't tell a student who logged in once and
    // is still active from one whose 3-hour cookie just carried over from
    // the PREVIOUS session without a fresh login at all. onDelete: set null
    // (not cascade) because this row is a historical login record, not
    // owned by the session the way jawaban/regu rows are -- deleting a
    // session should never erase the fact that a login attempt happened.
    sesiId: integer("sesi_id").references(() => sesi.id, { onDelete: "set null" }),
  },
  (t) => [index("percobaan_nim_idx").on(t.nim, t.pada), index("percobaan_ip_idx").on(t.ip, t.pada)],
);

/**
 * Every assistant action, ever. This is the load-bearing mitigation the
 * Phase 1 plan calls for: an assistant password derived from their own NIM
 * is not a secret (the NIMs are printed in the handbook), so the auth model
 * cannot promise prevention. What it can promise is that any action taken
 * is attributable to the NIM that authenticated when it happened — this
 * table is what makes that true.
 */
export const audit = pgTable(
  "audit",
  {
    id: serial("id").primaryKey(),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
    aktorNim: text("aktor_nim").notNull(),
    aksi: text("aksi").notNull(),
    detail: text("detail"), // free-form JSON string; no fixed shape needed yet
  },
  (t) => [index("audit_pada_idx").on(t.pada)],
);

/**
 * Phase 2 — one row per registered Orange Pi. `alamatLan` is the fixed LAN
 * address boards and phones use to reach it (192.168.4.1 under the router
 * topology the Phase 2 plan settled on) — distinct from whatever public IP
 * the router happens to have, which is irrelevant to anyone on the practicum
 * network. `agenKunciHash` is null until the agent completes enrollment;
 * `daftarTokenHash`/`daftarTokenExp` exist only during that window and are
 * cleared once consumed, so a stale token can never be replayed.
 */
export const server = pgTable("server", {
  id: serial("id").primaryKey(),
  nama: text("nama").notNull(),
  kode: text("kode").notNull().unique(),
  alamatLan: text("alamat_lan"),
  agenKunciHash: text("agen_kunci_hash"),
  daftarTokenHash: text("daftar_token_hash"),
  daftarTokenExp: timestamp("daftar_token_exp", { withTimezone: true }),
  terdaftarPada: timestamp("terdaftar_pada", { withTimezone: true }),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  // P6.2 (0006): a free-text note and a physical location an assistant can
  // set from the server centre -- neither is inferred from anything the
  // agent reports.
  catatan: text("catatan"),
  lokasi: text("lokasi"),
  // The bundle SHA pair the agent reads from its own BUNDLE.txt (see
  // orangepi/build_bundle.py and agent.py's _agen_versi()) and reports on
  // every heartbeat, so "is this Pi actually running what I just shipped"
  // is answered by the dashboard instead of trusted on faith.
  agenVersi: text("agen_versi"),
  // The hourly system-info block P6.7 adds to the agent's heartbeat
  // (kernel, OS, interfaces, service versions) -- the column exists now so
  // P6.2's heartbeat handler has somewhere to put it the moment the agent
  // starts sending one, without a second migration just for that.
  infoSistem: jsonb("info_sistem").$type<Record<string, unknown>>(),
  infoSistemPada: timestamp("info_sistem_pada", { withTimezone: true }),
  // Phase 9 Stage 5 (0015): the latest `kondisi` block from the heartbeat
  // (load average, memory, swap and disk in bytes, uplink traffic, clock
  // offset). Only the newest one is kept; the charts still come from denyut.
  kondisi: jsonb("kondisi").$type<Record<string, unknown>>(),
  kondisiPada: timestamp("kondisi_pada", { withTimezone: true }),
  // "Kosongkan log" on the History dialog: events before this are hidden
  // (the denyut rows stay, the charts need them). The audit log keeps what
  // was cleared.
  riwayatSejak: timestamp("riwayat_sejak", { withTimezone: true }),
  // Phase 9 (0020): the Module 4 hunt's latest /ringkas.json, forwarded by
  // the agent, for the Praktikan's Perburuan step. Only the newest is kept.
  perburuan: jsonb("perburuan").$type<Record<string, unknown>>(),
  perburuanPada: timestamp("perburuan_pada", { withTimezone: true }),
  // The hotspot the Pi runs for Module 4, read by the agent from its own
  // hostapd file at run time ({ ssid, sandi }), for the join QR.
  hotspot: jsonb("hotspot").$type<{ ssid: string; sandi: string | null }>(),
});

/**
 * One row per heartbeat. Grows without bound unless pruned — see
 * pruneOldHeartbeats() in server-lib.ts, called probabilistically on write
 * rather than via a cron job, so the table stays bounded with no second
 * moving part to keep running.
 */
export const denyut = pgTable(
  "denyut",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
    cpu: integer("cpu"), // percent, 0-100
    memori: integer("memori"), // percent, 0-100
    disk: integer("disk"), // percent, 0-100
    suhu: integer("suhu"), // celsius
    // Phase 9 (0021): network in + out, bytes per second, from `kondisi`.
    jaringan: integer("jaringan"),
    uptimeSec: integer("uptime_sec"),
    jamSelaras: boolean("jam_selaras").notNull().default(false),
    modeJaringan: text("mode_jaringan"), // "ethernet-router" | "ap-mandiri" | "ap+uplink" | "offline"
    layanan: jsonb("layanan").$type<Record<string, string>>(),
  },
  (t) => [index("denyut_server_pada_idx").on(t.serverId, t.pada)],
);

/**
 * A discovered MCU. `mac` is the identity that survives a reboot or a DHCP
 * lease change; `diadopsi` flips true the moment an assistant names it, and
 * from then on it shows up as "Kelompok 3 Hunter" rather than a bare MAC
 * everywhere the dashboard lists devices. UNIQUE(serverId, mac) is what lets
 * rediscovering the same board update its row instead of growing a
 * duplicate — the same role Phase 1's UNIQUE(tanggal, nim) plays.
 */
export const perangkat = pgTable(
  "perangkat",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    mac: text("mac").notNull(),
    ip: text("ip"),
    vendor: text("vendor"),
    jenis: text("jenis"), // "esp32" | "pico-w" | "cosmic-lora" | "tidak-diketahui"
    nama: text("nama"),
    diadopsi: boolean("diadopsi").notNull().default(false),
    sumber: text("sumber").notNull(), // "arp" | "modul4" | "mosquitto"
    pertamaTerlihat: timestamp("pertama_terlihat", { withTimezone: true }).notNull().defaultNow(),
    terakhirTerlihat: timestamp("terakhir_terlihat", { withTimezone: true }).notNull().defaultNow(),
    // P6.2 (0006): which group's board this is, set by hand from the P6.7
    // server centre's device list -- null until an assistant assigns one.
    kelompokNomor: integer("kelompok_nomor"),
    // An assistant can hide a device that isn't actually a practicum board
    // (a router, a phone that walked through the AP's DHCP range) without
    // deleting its row, so rediscovering the same MAC doesn't just bring it
    // straight back.
    disembunyikan: boolean("disembunyikan").notNull().default(false),
  },
  (t) => [unique("perangkat_server_mac").on(t.serverId, t.mac)],
);

/**
 * A queued action for the agent to run. `aksi` is validated against the
 * fixed whitelist server-side (see agent-command.ts's AKSI enum) AND again
 * by the agent itself before it maps to an argv list — never trust one side
 * of a network boundary to have been the only thing enforcing a rule the
 * other side depends on.
 */
export const perintah = pgTable(
  "perintah",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    aksi: text("aksi").notNull(),
    argumen: jsonb("argumen").$type<Record<string, string>>(),
    // "kedaluwarsa" (P6.2/B7) is the fourth terminal status, alongside
    // selesai/gagal: a command the agent claimed but never reported back on
    // (terkirim past 5 minutes) or one that sat unclaimed too long (menunggu
    // past 30 minutes) -- both swept by sweepPerintahKedaluwarsa() on every
    // heartbeat, from any server, not just the one the command was queued
    // for. This column has no DB check constraint (free text, like the rest
    // of this enum was already), so adding this value is an application
    // change only.
    status: text("status", { enum: ["menunggu", "terkirim", "selesai", "gagal", "kedaluwarsa"] })
      .notNull()
      .default("menunggu"),
    dimintaOleh: text("diminta_oleh").notNull(), // NIM, matching audit.aktorNim's shape
    dimintaPada: timestamp("diminta_pada", { withTimezone: true }).notNull().defaultNow(),
    // P6.2 (0006, fixes B7): set the moment a command is atomically claimed
    // (menunggu -> terkirim), never on insert -- this is what the expiry
    // sweep measures a "too long in terkirim" duration against, and what
    // the old SELECT-then-UPDATE race had no way to record at all.
    terkirimPada: timestamp("terkirim_pada", { withTimezone: true }),
    selesaiPada: timestamp("selesai_pada", { withTimezone: true }),
    keluaran: text("keluaran"),
  },
  (t) => [index("perintah_server_status_idx").on(t.serverId, t.status)],
);

/**
 * Phase 5 Stage 20: the single most-recent telemetry row per (module,
 * group) -- what the live Ladder/LayerXray/GroupLive views actually poll,
 * since they only ever need "what just happened", not history. Upserted on
 * every heartbeat that carries a row for this key (ON CONFLICT DO UPDATE on
 * the unique pair below), so this table stays exactly one row per key
 * rather than growing; telemetriLog below is the append-only side that
 * feeds /reports' per-session telemetry summary (P6.8; originally planned
 * as its own /history page in Stage 20, folded into /reports instead).
 *
 * `tx`/`rx` are "HH:MM:SS:MS" strings, matching every module's own
 * on-device print format, not a computed duration -- deliberately, since
 * Modules 2 and 3 only ever see the *arrival* side (the Pi has no visibility
 * into when an ESP32 or Pico W actually sent), so `tx` is null and `delayMs`
 * stays null for both; the web UI labels their delay column "from your
 * serial output" rather than showing a number the Pi cannot actually know.
 * Module 4's hunter/beacon exchange both sides directly over LoRa, so it's
 * the only module where `tx`, `rx`, and `delayMs` are all populated.
 */
export const telemetriTerkini = pgTable(
  "telemetri_terkini",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    modul: integer("modul").notNull(), // 2, 3, or 4; Module 1 rows live only in telemetri_log
    kelompokNomor: integer("kelompok_nomor").notNull(),
    seq: integer("seq").notNull(),
    tx: text("tx"),
    rx: text("rx"),
    delayMs: integer("delay_ms"),
    rssi: integer("rssi"), // Module 4 only
    snr: real("snr"), // Module 4 only, dB as the Hunter prints it (0017: was an integer that dropped 7.5)
    // Phase 9 (0017): the reading itself, per module. M2 {suhu, lembap},
    // M3 {posisi}, M4 {rssiHalus, jarak, tren, hilang}. Shape: TelemetriNilai.
    nilai: jsonb("nilai").$type<Record<string, number>>(),
    diperbaruiPada: timestamp("diperbarui_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("telemetri_terkini_server_modul_kelompok").on(t.serverId, t.modul, t.kelompokNomor),
  ],
);

/**
 * Append-only history of every telemetry row that has ever arrived, for
 * /reports' per-session telemetry summary (P6.8) -- pruned the same way
 * `denyut` is (see
 * pruneOldTelemetryOccasionally() in server-lib.ts), since a full
 * practicum day's worth of per-message rows across five groups and three
 * live modules would otherwise grow without bound. `sesiId` is nullable
 * for the same reason `jawaban.sesiId` is: telemetry collected outside a
 * tracked session (a dry run, a fixture script) still has somewhere to go.
 */
export const telemetriLog = pgTable(
  "telemetri_log",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id").references(() => sesi.id, { onDelete: "cascade" }),
    // P6.2 (0006): which Pi this row came from -- the plain history table
    // never recorded this before (only telemetriTerkini did, since it's
    // keyed by serverId), so a lab with more than one Pi had no way to
    // attribute a row in /reports to the box that actually sent it. Nullable
    // and set null (not cascade) on delete for the same reason percobaanMasuk
    // .sesiId is: a history row outlives the server registration if that
    // server is ever deregistered.
    serverId: integer("server_id").references(() => server.id, { onDelete: "set null" }),
    modul: integer("modul").notNull(),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    seq: integer("seq").notNull(),
    tx: text("tx"),
    rx: text("rx"),
    delayMs: integer("delay_ms"),
    rssi: integer("rssi"),
    snr: real("snr"),
    nilai: jsonb("nilai").$type<Record<string, number>>(),
    // P6.2 (0006, fixes half of B8): when the agent actually measured this
    // reading (its own diukurPada), distinct from dicatatPada below, which
    // is only ever this row's INSERT time. A Pi that spooled readings while
    // offline and sent them all in one later heartbeat used to have every
    // one of them recorded as having happened at that single flush moment.
    diukurPada: timestamp("diukur_pada", { withTimezone: true }),
    dicatatPada: timestamp("dicatat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("telemetri_log_sesi_modul_kelompok_idx").on(t.sesiId, t.modul, t.kelompokNomor)],
);

/**
 * P6.2 (0006) -- small, assistant-editable key/value settings that don't
 * deserve their own table each. The first (and for now only) key is
 * `modul_terbuka` (P6.5): a sorted JSON array of which module numbers
 * students can currently access, cumulative (opening module 3 also means 1
 * and 2 stay open). `nilai` is jsonb rather than a typed column per key
 * because different settings this table will eventually hold have no
 * shared shape -- a boolean flag and an int array are both just "the current
 * value of this key" to anything that isn't the one feature reading it.
 */
export const pengaturan = pgTable("pengaturan", {
  kunci: text("kunci").primaryKey(),
  nilai: jsonb("nilai").notNull(),
  diubahOleh: text("diubah_oleh"), // NIM, matching audit.aktorNim's shape; null for a seeded default
  diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
});

// NILAI_KOMPONEN is imported (and re-exported for server-side callers, e.g.
// api/session/[aksi].ts) at the top of this file, not here -- see
// ./nilai-komponen.ts's own header comment for why client code should
// import the component list from there directly instead of from this file.

/**
 * One row per (session, student, grading component) rather than one wide
 * row per student, so entering a single component for a single student is a
 * single upsert (this is what "autosave per field" needs) instead of a
 * read-modify-write of a whole-row JSON blob. Keyed by `nim` directly, not
 * `anggota.id` -- grading is a per-practicum-run event tied to who actually
 * sat the session, and a student's group membership can in principle change
 * between sessions without invalidating a grade already entered for one.
 */
export const nilai = pgTable(
  "nilai",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    komponen: text("komponen", { enum: NILAI_KOMPONEN }).notNull(),
    skor: integer("skor").notNull(),
    diubahOleh: text("diubah_oleh").notNull(), // asisten NIM, matching audit.aktorNim's shape
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("nilai_sesi_nim_komponen").on(t.sesiId, t.nim, t.komponen),
    index("nilai_sesi_idx").on(t.sesiId),
  ],
);

/**
 * A Praktikan the scoring Asisten marked Tidak Hadir for one session: every
 * component starts at 0 (still editable), and Sama Rata entry skips them.
 */
export const nilaiAbsen = pgTable(
  "nilai_absen",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    ditandaiOleh: text("ditandai_oleh").notNull(),
    ditandaiPada: timestamp("ditandai_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("nilai_absen_sesi_nim").on(t.sesiId, t.nim)],
);

/**
 * Kirim Nilai (2026-10-09): a group's scores sent by its Asisten once every
 * member is complete. Only then do its Praktikan see their own scores and
 * does the group earn its payment unit. Later edits stay allowed and show
 * at once; the row keeps who sent it first and when.
 */
export const nilaiKirim = pgTable(
  "nilai_kirim",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    dikirimOleh: text("dikirim_oleh").notNull(),
    dikirimPada: timestamp("dikirim_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("nilai_kirim_sesi_kelompok").on(t.sesiId, t.kelompokNomor)],
);

/* --------------------------------------------- Phase 9 Stage 3: rosters */

/**
 * The semester's Praktikan list (Preparation, right pane): everyone who may
 * be placed in a slot roster, from the XLSX import or added by hand.
 */
export const praktikan = pgTable(
  "praktikan",
  {
    nim: text("nim").primaryKey(),
    nama: text("nama").notNull(),
    kelas: text("kelas", { enum: KELAS }).notNull().default("reguler"),
    semester: text("semester").notNull(),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("praktikan_semester_idx").on(t.semester)],
);

/**
 * One group of a weekly slot's roster: whether it runs and its SeeLabs KLP
 * number. The group count itself is jadwal.jumlah_kelompok.
 */
export const rosterKelompok = pgTable(
  "roster_kelompok",
  {
    id: serial("id").primaryKey(),
    semester: text("semester").notNull(),
    hari: integer("hari").notNull(),
    slot: integer("slot").notNull(),
    nomor: integer("nomor").notNull(),
    aktif: boolean("aktif").notNull().default(true),
    klpSeelabs: text("klp_seelabs"),
  },
  (t) => [unique("roster_kelompok_unik").on(t.semester, t.hari, t.slot, t.nomor)],
);

/**
 * Who sits in which group of a weekly slot. Rosters belong to the slot and
 * are reused every week; a Praktikan is in one slot per semester.
 */
export const rosterSlot = pgTable(
  "roster_slot",
  {
    id: serial("id").primaryKey(),
    semester: text("semester").notNull(),
    hari: integer("hari").notNull(),
    slot: integer("slot").notNull(),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    nim: text("nim")
      .notNull()
      .references(() => praktikan.nim, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull().default(0),
  },
  (t) => [
    unique("roster_slot_satu_slot").on(t.semester, t.nim),
    index("roster_slot_slot_idx").on(t.semester, t.hari, t.slot),
  ],
);

/** A Praktikum Susulan's one-off roster, on its draft session. */
export const rosterSusulan = pgTable(
  "roster_susulan",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    nim: text("nim").notNull(),
    nama: text("nama").notNull(),
    urutan: integer("urutan").notNull().default(0),
  },
  (t) => [unique("roster_susulan_unik").on(t.sesiId, t.nim)],
);

/**
 * The groups as they were when a session started, so past sessions keep
 * their own groups after the next session rewrites kelompok and anggota.
 */
export const sesiAnggota = pgTable(
  "sesi_anggota",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    nim: text("nim").notNull(),
    nama: text("nama").notNull(),
  },
  (t) => [
    unique("sesi_anggota_unik").on(t.sesiId, t.nim),
    index("sesi_anggota_sesi_idx").on(t.sesiId),
  ],
);

/**
 * The Asisten's own Ringkasan (Brief) per module and language, shown over
 * the handbook's text on the module page.
 */
export const modulBrief = pgTable(
  "modul_brief",
  {
    modul: integer("modul").notNull(),
    bahasa: text("bahasa").notNull(),
    isi: jsonb("isi").$type<{ ringkasan: string; langkah: string[] }>().notNull(),
    diubahOleh: text("diubah_oleh").notNull(),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.modul, t.bahasa] })],
);

/**
 * What happened during a session that Reports needs later: pairing changes
 * (a group's assistant swapped), extensions, a borrowed SeeLabs account,
 * the carry into a susulan, the room handover.
 */
export const sesiKejadian = pgTable(
  "sesi_kejadian",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    jenis: text("jenis").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    aktorNim: text("aktor_nim").notNull(),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sesi_kejadian_sesi_idx").on(t.sesiId)],
);

/**
 * Each time scores were copied for SeeLabs ("Salin untuk SeeLabs" or the
 * bookmarklet) and, once confirmed, saved there. The payload hash tells a
 * later copy whether the scores changed since.
 */
export const seelabsEkspor = pgTable(
  "seelabs_ekspor",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    klp: text("klp"),
    modul: integer("modul").notNull(),
    akunNim: text("akun_nim").notNull(),
    payloadHash: text("payload_hash").notNull(),
    disalinPada: timestamp("disalin_pada", { withTimezone: true }).notNull().defaultNow(),
    disimpanPada: timestamp("disimpan_pada", { withTimezone: true }),
  },
  (t) => [index("seelabs_ekspor_sesi_idx").on(t.sesiId)],
);

/* ------------------------------------ Phase 9 Stage 6: payments, reports */

/**
 * The uang kas rate per semester. A new row starts on `berlaku_mulai`;
 * sessions before it keep the rate they had (each unit snapshots it).
 */
export const kasTarif = pgTable(
  "kas_tarif",
  {
    id: serial("id").primaryKey(),
    semester: text("semester").notNull(),
    persen: integer("persen").notNull(),
    berlakuMulai: text("berlaku_mulai").notNull(), // ISO date
    diubahOleh: text("diubah_oleh"),
    alasan: text("alasan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("kas_tarif_semester_idx").on(t.semester),
    check("kas_tarif_persen", sql`${t.persen} between 0 and 50`),
  ],
);

/** A per-person uang kas rate for one semester, overriding kas_tarif. */
export const kasPengecualian = pgTable(
  "kas_pengecualian",
  {
    id: serial("id").primaryKey(),
    semester: text("semester").notNull(),
    nim: text("nim").notNull(),
    persen: integer("persen").notNull(),
    alasan: text("alasan"),
    diubahOleh: text("diubah_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("kas_pengecualian_unik").on(t.semester, t.nim),
    check("kas_pengecualian_persen", sql`${t.persen} between 0 and 50`),
  ],
);

/**
 * One scored group in a finished session: one pay unit for the Asisten who
 * scored it (whoever's SeeLabs account carried it). Rate and kas are
 * snapshots from when the unit was made, so a later change never rewrites
 * what was already earned.
 */
export const unitBayar = pgTable(
  "unit_bayar",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    tanggal: text("tanggal").notNull(),
    nimPenilai: text("nim_penilai").notNull(),
    nimAkunSeelabs: text("nim_akun_seelabs"),
    kelas: text("kelas", { enum: KELAS }).notNull(),
    kotor: integer("kotor").notNull(),
    kasPersen: integer("kas_persen").notNull(),
    kas: integer("kas").notNull(),
    bersih: integer("bersih").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    diperbaruiPada: timestamp("diperbarui_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("unit_bayar_unik").on(t.sesiId, t.kelompokNomor),
    index("unit_bayar_nim_idx").on(t.nimPenilai),
  ],
);

/**
 * A transfer that was made, per Asisten and month: "kotor" from the
 * Bendahara to the Asisten, "balik" (the uang kas) from the Asisten to the
 * Kas IRIS. What is still owed is computed from unit_bayar minus these.
 */
export const transfer = pgTable(
  "transfer",
  {
    id: serial("id").primaryKey(),
    periode: text("periode").notNull(), // "2026-09"
    jenis: text("jenis", { enum: ["kotor", "balik"] }).notNull(),
    nim: text("nim").notNull(),
    jumlah: integer("jumlah").notNull(),
    ditransferPada: timestamp("ditransfer_pada", { withTimezone: true }).notNull().defaultNow(),
    ditandaiOleh: text("ditandai_oleh").notNull(),
  },
  (t) => [index("transfer_periode_idx").on(t.periode)],
);

/**
 * A written report (Laporan › Dokumen): a block document. Drafts are the
 * author's own; once sent, every Asisten can read it. Requests to the Admin
 * move on to diproses and selesai, with the Admin's reply.
 */
export const laporan = pgTable(
  "laporan",
  {
    id: serial("id").primaryKey(),
    judul: text("judul").notNull(),
    jenis: text("jenis", { enum: ["sesi", "kerusakan", "permintaan", "lainnya"] }).notNull(),
    status: text("status", { enum: ["draf", "terkirim", "diproses", "selesai"] })
      .notNull()
      .default("draf"),
    blok: jsonb("blok").$type<Record<string, unknown>[]>().notNull().default([]),
    konteks: jsonb("konteks").$type<Record<string, unknown>>().notNull().default({}),
    penulisNim: text("penulis_nim").notNull(),
    balasan: text("balasan"),
    diprosesOleh: text("diproses_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
    dikirimPada: timestamp("dikirim_pada", { withTimezone: true }),
  },
  (t) => [index("laporan_status_idx").on(t.status), index("laporan_penulis_idx").on(t.penulisNim)],
);

export const laporanKomentar = pgTable(
  "laporan_komentar",
  {
    id: serial("id").primaryKey(),
    laporanId: integer("laporan_id")
      .notNull()
      .references(() => laporan.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    isi: text("isi").notNull(),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("laporan_komentar_idx").on(t.laporanId)],
);

export const laporanLampiran = pgTable(
  "laporan_lampiran",
  {
    id: serial("id").primaryKey(),
    laporanId: integer("laporan_id")
      .notNull()
      .references(() => laporan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    url: text("url").notNull(),
    tipe: text("tipe").notNull(),
    ukuran: integer("ukuran").notNull(),
    nim: text("nim").notNull(),
    pada: timestamp("pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("laporan_lampiran_idx").on(t.laporanId)],
);

/**
 * Phase 9 (0018): "Tangkap 5 Data Terakhir" from the Live room, saved to the
 * group's journal. One row per save: the paper table's rows exactly as the
 * capture showed them (`jenis` "paket" = the module's message table, 5 rows;
 * "jarak" = Module 4's Near / Middle / Far table, 3 rows). `nim` is whoever
 * pressed Save (a Praktikan, or the paired Asisten acting as the group).
 */
export const jurnalTangkapan = pgTable(
  "jurnal_tangkapan",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id").references(() => sesi.id, { onDelete: "cascade" }),
    kelompokId: integer("kelompok_id")
      .notNull()
      .references(() => kelompok.id, { onDelete: "cascade" }),
    modul: integer("modul").notNull(),
    jenis: text("jenis", { enum: ["paket", "jarak"] }).notNull(),
    baris: jsonb("baris").$type<Record<string, string | number | boolean | null>[]>().notNull(),
    nim: text("nim").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jurnal_tangkapan_kelompok_idx").on(t.kelompokId, t.modul),
    index("jurnal_tangkapan_sesi_idx").on(t.sesiId),
    check("jurnal_tangkapan_jenis", sql`${t.jenis} in ('paket', 'jarak')`),
    check("jurnal_tangkapan_modul", sql`${t.modul} between 1 and 4`),
  ],
);

/**
 * Phase 9 (0018): the Asisten's serial mirror. The group laptop forwards its
 * boards' raw lines (rate-limited) so the Asisten sees them without standing
 * at the desk. Only the running session's rows are read, and each group
 * keeps its newest few hundred.
 */
export const serialCermin = pgTable(
  "serial_cermin",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    kelompokNomor: integer("kelompok_nomor").notNull(),
    sumber: text("sumber").notNull(),
    teks: text("teks").notNull(),
    /** Milliseconds since midnight, from the line's own stamp or its arrival. */
    t: integer("t").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("serial_cermin_sesi_kelompok_idx").on(t.sesiId, t.kelompokNomor, t.id)],
);

/**
 * Phase 9 Stage 9 (0019): Konsol Pi, the terminal and the Pi's screens in the
 * Server page. Since 2026-10-05 any active Asisten may ask; the Pencipta,
 * the Inti and DEV open without an approver (lib/konsol.ts). One row per request, from the
 * ask to the end; `transkrip` is the terminal output the Pi's bridge kept
 * (trimmed), reported on a later heartbeat. Approval, a forced open during a
 * session and every end reason are kept here and in Audit.
 */
export const konsolPi = pgTable(
  "konsol_pi",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    target: text("target", { enum: ["terminal", ":0", ":1"] }).notNull(),
    alasan: text("alasan").notNull(),
    status: text("status", {
      enum: ["diminta", "disetujui", "ditolak", "aktif", "selesai", "kedaluwarsa", "diputus"],
    })
      .notNull()
      .default("diminta"),
    // The relay room; a random id, never a secret (the tickets are).
    kanal: text("kanal").notNull().unique(),
    disetujuiOleh: text("disetujui_oleh"),
    // The Pencipta opens without an approver; the other DEVs are told.
    tanpaPersetujuan: boolean("tanpa_persetujuan").notNull().default(false),
    overrideSesiOleh: text("override_sesi_oleh"),
    overrideAlasan: text("override_alasan"),
    dimintaPada: timestamp("diminta_pada", { withTimezone: true }).notNull().defaultNow(),
    disetujuiPada: timestamp("disetujui_pada", { withTimezone: true }),
    mulai: timestamp("mulai", { withTimezone: true }),
    selesai: timestamp("selesai", { withTimezone: true }),
    alasanSelesai: text("alasan_selesai"),
    diputusOleh: text("diputus_oleh"),
    transkripBytes: integer("transkrip_bytes"),
    transkrip: text("transkrip"),
  },
  (t) => [
    index("konsol_pi_server_status_idx").on(t.serverId, t.status),
    check("konsol_pi_target", sql`${t.target} in ('terminal', ':0', ':1')`),
    check(
      "konsol_pi_status",
      sql`${t.status} in ('diminta', 'disetujui', 'ditolak', 'aktif', 'selesai', 'kedaluwarsa', 'diputus')`,
    ),
  ],
);

/**
 * Konsol Pi (2026-10-05): everyone besides the owner who is let into an open
 * console. The Pencipta, the Inti (Admin tier) and DEV join without asking
 * (tanpa_persetujuan); anyone else asks, and the owner or one of those
 * answers. Who controls inside the room is the relay's (apps/relay).
 */
export const konsolPeserta = pgTable(
  "konsol_peserta",
  {
    id: serial("id").primaryKey(),
    konsolId: integer("konsol_id")
      .notNull()
      .references(() => konsolPi.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    status: text("status", { enum: ["diminta", "disetujui", "ditolak"] })
      .notNull()
      .default("diminta"),
    alasan: text("alasan"),
    tanpaPersetujuan: boolean("tanpa_persetujuan").notNull().default(false),
    disetujuiOleh: text("disetujui_oleh"),
    dimintaPada: timestamp("diminta_pada", { withTimezone: true }).notNull().defaultNow(),
    dijawabPada: timestamp("dijawab_pada", { withTimezone: true }),
  },
  (t) => [
    unique("konsol_peserta_satu").on(t.konsolId, t.nim),
    check("konsol_peserta_status", sql`${t.status} in ('diminta', 'disetujui', 'ditolak')`),
  ],
);

/** Every ticket nonce issued for Konsol Pi (the relay refuses a reused one). */
export const konsolTiketNonce = pgTable("konsol_tiket_nonce", {
  nonce: text("nonce").primaryKey(),
  konsolId: integer("konsol_id")
    .notNull()
    .references(() => konsolPi.id, { onDelete: "cascade" }),
  peran: text("peran", { enum: ["web", "pi"] }).notNull(),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
});

/** Questions and objections to a console the Pencipta opened (Ask, Reject). */
export const konsolKeberatan = pgTable(
  "konsol_keberatan",
  {
    id: serial("id").primaryKey(),
    konsolId: integer("konsol_id")
      .notNull()
      .references(() => konsolPi.id, { onDelete: "cascade" }),
    nim: text("nim").notNull(),
    jenis: text("jenis", { enum: ["oke", "tanya", "tolak"] }).notNull(),
    teks: text("teks"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("konsol_keberatan_konsol_idx").on(t.konsolId),
    check("konsol_keberatan_jenis", sql`${t.jenis} in ('oke', 'tanya', 'tolak')`),
  ],
);
