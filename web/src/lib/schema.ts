/**
 * IRIS IoT practicum site — database schema (Drizzle, Postgres/Neon).
 *
 * Phase 1 (five tables: asisten, sesi, regu, praktikan, percobaanMasuk, audit)
 * plus Phase 2's server/device registry (server, denyut, perangkat, perintah).
 * The live IoT-layer X-ray and module content each get their own migration
 * when that phase is planned.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  serial,
  unique,
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
});

/**
 * One practicum session: a single module, on a single day, at a single
 * start time. Mirrors the shape modul4/server.py already proved out for
 * Module 4 (JADWAL_MULAI, SESI_DURASI_SEC), generalised to any module so
 * the same table serves Modules 1-3 as well once their content phase lands.
 */
export const sesi = pgTable(
  "sesi",
  {
    id: serial("id").primaryKey(),
    tanggal: text("tanggal").notNull(), // ISO date, e.g. "2026-09-19"
    mulai: text("mulai").notNull(), // "HH:MM", local lab time
    modul: integer("modul").notNull(), // 1-4
    status: text("status", { enum: ["terjadwal", "berjalan", "selesai"] })
      .notNull()
      .default("terjadwal"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The same slot (module, day, start time) is never scheduled twice —
    // this is what a re-submitted or double-clicked "create session" form
    // must fail against, rather than silently producing a duplicate.
    unique("sesi_slot_unik").on(t.tanggal, t.modul, t.mulai),
    index("sesi_tanggal_idx").on(t.tanggal),
  ],
);

/**
 * A group within one session. `nomor` is the human-facing group number
 * (1, 2, 3, ...) shown on the roster paste box and the scoreboard;
 * `aktif` mirrors modul4/'s "this group's board is the beacon, not a
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
 * (tanggal, nim) is the load-bearing rule: modul4/'s paste-box parser
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
 * auth route uses for rate limiting where modul4/server.py could just keep a
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
