CREATE TABLE "izin" (
	"id" serial PRIMARY KEY NOT NULL,
	"nim" text NOT NULL,
	"jadwal_id" integer NOT NULL,
	"tanggal" text NOT NULL,
	"alasan" text,
	"status" text DEFAULT 'aktif' NOT NULL,
	"pengganti_nim" text,
	"dibuat_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "izin_satu" UNIQUE("nim","jadwal_id","tanggal")
);
--> statement-breakpoint
CREATE TABLE "penugasan_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"jadwal_id" integer NOT NULL,
	"tanggal" text NOT NULL,
	"kelompok_nomor" integer,
	"nim" text NOT NULL,
	"jenis" text NOT NULL,
	"tag" text,
	"status" text DEFAULT 'diterima' NOT NULL,
	"hadir" boolean,
	"masuk_pada" timestamp with time zone,
	"diminta_oleh" text NOT NULL,
	"dikonfirmasi_oleh" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "penugasan_slot_orang" UNIQUE("jadwal_id","tanggal","nim")
);
--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "warna_kosong" text;--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "libur_tanggal" text;--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "diubah_oleh" text;--> statement-breakpoint
ALTER TABLE "izin" ADD CONSTRAINT "izin_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "izin" ADD CONSTRAINT "izin_jadwal_id_jadwal_id_fk" FOREIGN KEY ("jadwal_id") REFERENCES "public"."jadwal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_slot" ADD CONSTRAINT "penugasan_slot_jadwal_id_jadwal_id_fk" FOREIGN KEY ("jadwal_id") REFERENCES "public"."jadwal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_slot" ADD CONSTRAINT "penugasan_slot_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "penugasan_slot_tanggal_idx" ON "penugasan_slot" USING btree ("tanggal");--> statement-breakpoint
ALTER TABLE "jadwal" ADD CONSTRAINT "jadwal_status_ok" CHECK ("status" IN ('aktif', 'segera', 'kosong') AND ("warna_kosong" IS NULL OR "warna_kosong" IN ('oranye', 'merah')));--> statement-breakpoint
ALTER TABLE "penugasan_slot" ADD CONSTRAINT "penugasan_slot_nilai_ok" CHECK ("jenis" IN ('tetap', 'pengganti', 'sukarela') AND "status" IN ('diminta', 'diterima', 'ditolak') AND ("tag" IS NULL OR "tag" IN ('fit', 'a24')) AND ("kelompok_nomor" IS NULL OR "kelompok_nomor" BETWEEN 1 AND 10));--> statement-breakpoint
ALTER TABLE "izin" ADD CONSTRAINT "izin_status_ok" CHECK ("status" IN ('aktif', 'dicari', 'dibatalkan'));--> statement-breakpoint
-- The JADWAL NGAJAR GANJIL sheet's empty slots: orange (Monday, Tuesday
-- slot 4, Saturday slot 4) and red (Tuesday slots 2 and 3, Wednesday slots
-- 1 and 2). Both mean no practicum. A slot that already has assistants is
-- left alone.
INSERT INTO "jadwal" ("semester", "hari", "slot", "status", "warna_kosong")
VALUES
	('2026-ganjil', 1, 1, 'kosong', 'oranye'), ('2026-ganjil', 1, 2, 'kosong', 'oranye'),
	('2026-ganjil', 1, 3, 'kosong', 'oranye'), ('2026-ganjil', 1, 4, 'kosong', 'oranye'),
	('2026-ganjil', 2, 4, 'kosong', 'oranye'), ('2026-ganjil', 6, 4, 'kosong', 'oranye'),
	('2026-ganjil', 2, 2, 'kosong', 'merah'), ('2026-ganjil', 2, 3, 'kosong', 'merah'),
	('2026-ganjil', 3, 1, 'kosong', 'merah'), ('2026-ganjil', 3, 2, 'kosong', 'merah')
ON CONFLICT ("semester", "hari", "slot") DO UPDATE
	SET "status" = 'kosong', "warna_kosong" = EXCLUDED."warna_kosong"
	WHERE "jadwal"."asisten" = '[]'::jsonb;
