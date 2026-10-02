CREATE TABLE "modul_brief" (
	"modul" integer NOT NULL,
	"bahasa" text NOT NULL,
	"isi" jsonb NOT NULL,
	"diubah_oleh" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modul_brief_modul_bahasa_pk" PRIMARY KEY("modul","bahasa")
);
--> statement-breakpoint
CREATE TABLE "praktikan" (
	"nim" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kelas" text DEFAULT 'reguler' NOT NULL,
	"semester" text NOT NULL,
	"dibuat_oleh" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_kelompok" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"hari" integer NOT NULL,
	"slot" integer NOT NULL,
	"nomor" integer NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"klp_seelabs" text,
	CONSTRAINT "roster_kelompok_unik" UNIQUE("semester","hari","slot","nomor")
);
--> statement-breakpoint
CREATE TABLE "roster_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"hari" integer NOT NULL,
	"slot" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"nim" text NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "roster_slot_satu_slot" UNIQUE("semester","nim")
);
--> statement-breakpoint
CREATE TABLE "roster_susulan" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "roster_susulan_unik" UNIQUE("sesi_id","nim")
);
--> statement-breakpoint
CREATE TABLE "seelabs_ekspor" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"klp" text,
	"modul" integer NOT NULL,
	"akun_nim" text NOT NULL,
	"payload_hash" text NOT NULL,
	"disalin_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"disimpan_pada" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sesi_anggota" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	CONSTRAINT "sesi_anggota_unik" UNIQUE("sesi_id","nim")
);
--> statement-breakpoint
CREATE TABLE "sesi_kejadian" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aktor_nim" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "jumlah_kelompok" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "anggota_per_kelompok" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "jendela_mulai_menit" integer;--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "jendela_diatur_oleh" text;--> statement-breakpoint
ALTER TABLE "kelompok" ADD COLUMN "klp_seelabs" text;--> statement-breakpoint
ALTER TABLE "presentasi" ADD COLUMN "jenis" text DEFAULT 'berkas' NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "durasi_menit" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "jenis" text DEFAULT 'reguler' NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "jumlah_kelompok" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "lanjutan_dari" integer;--> statement-breakpoint
ALTER TABLE "skema" ADD COLUMN "jenis" text DEFAULT 'berkas' NOT NULL;--> statement-breakpoint
ALTER TABLE "roster_slot" ADD CONSTRAINT "roster_slot_nim_praktikan_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."praktikan"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_susulan" ADD CONSTRAINT "roster_susulan_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seelabs_ekspor" ADD CONSTRAINT "seelabs_ekspor_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_anggota" ADD CONSTRAINT "sesi_anggota_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_kejadian" ADD CONSTRAINT "sesi_kejadian_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "praktikan_semester_idx" ON "praktikan" USING btree ("semester");--> statement-breakpoint
CREATE INDEX "roster_slot_slot_idx" ON "roster_slot" USING btree ("semester","hari","slot");--> statement-breakpoint
CREATE INDEX "seelabs_ekspor_sesi_idx" ON "seelabs_ekspor" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "sesi_anggota_sesi_idx" ON "sesi_anggota" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "sesi_kejadian_sesi_idx" ON "sesi_kejadian" USING btree ("sesi_id");--> statement-breakpoint
ALTER TABLE "sesi" ADD CONSTRAINT "sesi_lanjutan_dari_sesi_id_fk" FOREIGN KEY ("lanjutan_dari") REFERENCES "public"."sesi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Phase 9 bounds the schema can't express: session length 30 to 150
-- minutes, 1 to 10 groups, a slot's own start window 5 to 30 minutes.
ALTER TABLE "sesi" ADD CONSTRAINT "sesi_durasi_batas" CHECK ("durasi_menit" BETWEEN 30 AND 150);--> statement-breakpoint
ALTER TABLE "sesi" ADD CONSTRAINT "sesi_kelompok_batas" CHECK ("jumlah_kelompok" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "jadwal" ADD CONSTRAINT "jadwal_kelompok_batas" CHECK ("jumlah_kelompok" BETWEEN 1 AND 10 AND "anggota_per_kelompok" BETWEEN 1 AND 8);--> statement-breakpoint
ALTER TABLE "jadwal" ADD CONSTRAINT "jadwal_jendela_batas" CHECK ("jendela_mulai_menit" IS NULL OR "jendela_mulai_menit" BETWEEN 5 AND 30);--> statement-breakpoint
-- The general start window: 15 minutes before the slot, adjustable
-- between 5 and 30 (Schedule Settings).
INSERT INTO "pengaturan" ("kunci", "nilai") VALUES
  ('jendela_mulai_default', '15'::jsonb),
  ('jendela_mulai_batas', '{"min":5,"max":30}'::jsonb)
ON CONFLICT ("kunci") DO NOTHING;--> statement-breakpoint
-- Today's roster becomes the start of the semester's Praktikan list, so
-- nobody has to be typed again. Placing them into slots is done in
-- Preparation. Safe to re-run.
INSERT INTO "praktikan" ("nim", "nama", "semester")
SELECT a."nim", a."nama", (SELECT max("semester") FROM "jadwal")
FROM "anggota" a
WHERE EXISTS (SELECT 1 FROM "jadwal")
ON CONFLICT ("nim") DO NOTHING;
