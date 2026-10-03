CREATE TABLE "kas_pengecualian" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"nim" text NOT NULL,
	"persen" integer NOT NULL,
	"alasan" text,
	"diubah_oleh" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kas_pengecualian_unik" UNIQUE("semester","nim"),
	CONSTRAINT "kas_pengecualian_persen" CHECK ("kas_pengecualian"."persen" between 0 and 50)
);
--> statement-breakpoint
CREATE TABLE "kas_tarif" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"persen" integer NOT NULL,
	"berlaku_mulai" text NOT NULL,
	"diubah_oleh" text,
	"alasan" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kas_tarif_persen" CHECK ("kas_tarif"."persen" between 0 and 50)
);
--> statement-breakpoint
CREATE TABLE "laporan" (
	"id" serial PRIMARY KEY NOT NULL,
	"judul" text NOT NULL,
	"jenis" text NOT NULL,
	"status" text DEFAULT 'draf' NOT NULL,
	"blok" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"konteks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"penulis_nim" text NOT NULL,
	"balasan" text,
	"diproses_oleh" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dikirim_pada" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "laporan_komentar" (
	"id" serial PRIMARY KEY NOT NULL,
	"laporan_id" integer NOT NULL,
	"nim" text NOT NULL,
	"isi" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laporan_lampiran" (
	"id" serial PRIMARY KEY NOT NULL,
	"laporan_id" integer NOT NULL,
	"nama" text NOT NULL,
	"url" text NOT NULL,
	"tipe" text NOT NULL,
	"ukuran" integer NOT NULL,
	"nim" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"id" serial PRIMARY KEY NOT NULL,
	"periode" text NOT NULL,
	"jenis" text NOT NULL,
	"nim" text NOT NULL,
	"jumlah" integer NOT NULL,
	"ditransfer_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"ditandai_oleh" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_bayar" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"tanggal" text NOT NULL,
	"nim_penilai" text NOT NULL,
	"nim_akun_seelabs" text,
	"kelas" text NOT NULL,
	"kotor" integer NOT NULL,
	"kas_persen" integer NOT NULL,
	"kas" integer NOT NULL,
	"bersih" integer NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diperbarui_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_bayar_unik" UNIQUE("sesi_id","kelompok_nomor")
);
--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "bayar_sinkron_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "laporan_komentar" ADD CONSTRAINT "laporan_komentar_laporan_id_laporan_id_fk" FOREIGN KEY ("laporan_id") REFERENCES "public"."laporan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laporan_lampiran" ADD CONSTRAINT "laporan_lampiran_laporan_id_laporan_id_fk" FOREIGN KEY ("laporan_id") REFERENCES "public"."laporan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_bayar" ADD CONSTRAINT "unit_bayar_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kas_tarif_semester_idx" ON "kas_tarif" USING btree ("semester");--> statement-breakpoint
CREATE INDEX "laporan_status_idx" ON "laporan" USING btree ("status");--> statement-breakpoint
CREATE INDEX "laporan_penulis_idx" ON "laporan" USING btree ("penulis_nim");--> statement-breakpoint
CREATE INDEX "laporan_komentar_idx" ON "laporan_komentar" USING btree ("laporan_id");--> statement-breakpoint
CREATE INDEX "laporan_lampiran_idx" ON "laporan_lampiran" USING btree ("laporan_id");--> statement-breakpoint
CREATE INDEX "transfer_periode_idx" ON "transfer" USING btree ("periode");--> statement-breakpoint
CREATE INDEX "unit_bayar_nim_idx" ON "unit_bayar" USING btree ("nim_penilai");--> statement-breakpoint
ALTER TABLE "laporan" ADD CONSTRAINT "laporan_nilai_ok" CHECK ("jenis" IN ('sesi', 'kerusakan', 'permintaan', 'lainnya') AND "status" IN ('draf', 'terkirim', 'diproses', 'selesai'));--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_nilai_ok" CHECK ("jenis" IN ('kotor', 'balik') AND "jumlah" > 0 AND "periode" ~ '^[0-9]{4}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "unit_bayar" ADD CONSTRAINT "unit_bayar_nilai_ok" CHECK ("kelas" IN ('reguler', 'internasional') AND "kas_persen" BETWEEN 0 AND 50 AND "kotor" >= 0 AND "kas" + "bersih" = "kotor");--> statement-breakpoint
INSERT INTO "kas_tarif" ("semester", "persen", "berlaku_mulai", "alasan") VALUES ('2026-ganjil', 10, '2026-08-01', 'tarif awal');--> statement-breakpoint
INSERT INTO "pengaturan" ("kunci", "nilai") VALUES ('tarif_unit', '{"reguler": 32500, "internasional": 65000}'::jsonb) ON CONFLICT ("kunci") DO NOTHING;
