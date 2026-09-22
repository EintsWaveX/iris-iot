CREATE TABLE "presentasi" (
	"id" serial PRIMARY KEY NOT NULL,
	"nama_berkas" text NOT NULL,
	"url" text NOT NULL,
	"diunggah_oleh" text NOT NULL,
	"diunggah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"aktif" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jawaban" ALTER COLUMN "sesi_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "password_diatur_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jawaban" ADD COLUMN "benar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jawaban" ADD COLUMN "percobaan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "slot" integer;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "butuh_ap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "presentasi_aktif_unik" ON "presentasi" USING btree ("aktif") WHERE "presentasi"."aktif" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "jawaban_kelompok_soal_tanpa_sesi" ON "jawaban" USING btree ("kelompok_id","soal_kode") WHERE "jawaban"."sesi_id" is null;