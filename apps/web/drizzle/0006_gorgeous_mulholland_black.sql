CREATE TABLE "pengaturan" (
	"kunci" text PRIMARY KEY NOT NULL,
	"nilai" jsonb NOT NULL,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perangkat" ADD COLUMN "kelompok_nomor" integer;--> statement-breakpoint
ALTER TABLE "perangkat" ADD COLUMN "disembunyikan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "percobaan_masuk" ADD COLUMN "sesi_id" integer;--> statement-breakpoint
ALTER TABLE "perintah" ADD COLUMN "terkirim_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "catatan" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "lokasi" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "agen_versi" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "info_sistem" jsonb;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "info_sistem_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telemetri_log" ADD COLUMN "server_id" integer;--> statement-breakpoint
ALTER TABLE "telemetri_log" ADD COLUMN "diukur_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "percobaan_masuk" ADD CONSTRAINT "percobaan_masuk_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetri_log" ADD CONSTRAINT "telemetri_log_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- P6.5's module-access gate reads this row; seeded here (hand-added to
-- drizzle-kit's generated DDL above -- generate never writes data, only
-- shape) rather than lazily on first read, so the gate's read path never
-- has to special-case "row doesn't exist yet" at all.
INSERT INTO "pengaturan" ("kunci", "nilai") VALUES ('modul_terbuka', '[1]') ON CONFLICT DO NOTHING;