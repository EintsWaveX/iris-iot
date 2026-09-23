/**
 * IRIS IoT practicum site — database schema (Drizzle, Postgres/Neon).
 *
 * Phase 1 (five tables: asisten, sesi, regu, praktikan, percobaanMasuk, audit)
 * plus Phase 2's server/device registry (server, denyut, perangkat, perintah).
 * The live IoT-layer X-ray and module content each get their own migration
 * when that phase is planned.
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
} from "drizzle-orm/pg-core";

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
});

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
    // True only for Module 4 Part A: the one part of the practicum that
    // needs the Orange Pi running as its own access point rather than as a
    // campus network client. A single wlan0 cannot be both at once (see the
    // Track B provisioning notes), so the scheduler must know which slots
    // need AP mode ahead of time rather than leaving it to memory.
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
  },
  (t) => [unique("sesi_kelompok_unik").on(t.sesiId, t.kelompokId)],
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
    namaBerkas: text("nama_berkas").notNull(),
    url: text("url").notNull(), // Vercel Blob URL
    diunggahOleh: text("diunggah_oleh").notNull(), // NIM, matching audit.aktorNim's shape
    diunggahPada: timestamp("diunggah_pada", { withTimezone: true }).notNull().defaultNow(),
    aktif: boolean("aktif").notNull().default(false),
  },
  (t) => [
    uniqueIndex("presentasi_aktif_unik")
      .on(t.aktif)
      .where(sql`${t.aktif} = true`),
  ],
);

/**
 * A group within one session. `nomor` is the human-facing group number
 * (1, 2, 3, ...) shown on the roster paste box and the scoreboard;
 * `aktif` mirrors apps/modul4/'s "this group's board is the beacon, not a
 * hunter" flag — an inactive group is excluded from login resolution
 * without needing its members deleted.
 */
export const regu = pgTable(
  "regu",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    nomor: integer("nomor").notNull(),
    nama: text("nama").notNull(),
    aktif: boolean("aktif").notNull().default(true),
  },
  (t) => [unique("regu_nomor_per_sesi").on(t.sesiId, t.nomor)],
);

/**
 * A practitioner within one session's group. The unique constraint on
 * (tanggal, nim) is the load-bearing rule: apps/modul4/'s paste-box parser
 * enforces "one NIM per day" in JavaScript today, which is a UI-layer
 * promise a direct API call could bypass. Making it a database constraint
 * means the invariant holds no matter which code path writes the row.
 *
 * `tanggal` is denormalised onto this table (rather than joined through
 * `sesi`) specifically so Postgres can enforce that constraint directly;
 * a cross-table uniqueness rule would need a trigger instead of a plain
 * unique index.
 */
export const praktikan = pgTable(
  "praktikan",
  {
    id: serial("id").primaryKey(),
    sesiId: integer("sesi_id")
      .notNull()
      .references(() => sesi.id, { onDelete: "cascade" }),
    reguId: integer("regu_id")
      .notNull()
      .references(() => regu.id, { onDelete: "cascade" }),
    tanggal: text("tanggal").notNull(),
    nim: text("nim").notNull(),
    nama: text("nama").notNull(),
  },
  (t) => [
    unique("praktikan_nim_per_hari").on(t.tanggal, t.nim),
    index("praktikan_sesi_idx").on(t.sesiId),
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
    jenis: text("jenis", { enum: ["asisten", "praktikan"] }).notNull(),
    berhasil: boolean("berhasil").notNull(),
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
    uptimeSec: integer("uptime_sec"),
    jamSelaras: boolean("jam_selaras").notNull().default(false),
    modeJaringan: text("mode_jaringan"), // "ethernet-router" | "ap-mandiri" | "offline"
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
    status: text("status", { enum: ["menunggu", "terkirim", "selesai", "gagal"] })
      .notNull()
      .default("menunggu"),
    dimintaOleh: text("diminta_oleh").notNull(), // NIM, matching audit.aktorNim's shape
    dimintaPada: timestamp("diminta_pada", { withTimezone: true }).notNull().defaultNow(),
    selesaiPada: timestamp("selesai_pada", { withTimezone: true }),
    keluaran: text("keluaran"),
  },
  (t) => [index("perintah_server_status_idx").on(t.serverId, t.status)],
);
