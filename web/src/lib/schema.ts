/**
 * IRIS IoT practicum site — database schema (Drizzle, Postgres/Neon).
 *
 * Five tables for Phase 1. Everything else the eventual feature set needs
 * (server registry, MCU inventory, layer-trace history) is out of scope
 * here and gets its own migration when that phase is planned.
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
 * start time. Mirrors the shape hunt/server.py already proved out for
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
 * `aktif` mirrors hunt/'s "this group's board is the beacon, not a
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
 * (tanggal, nim) is the load-bearing rule: hunt/'s paste-box parser
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
 * auth route uses for rate limiting where hunt/server.py could just keep a
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
