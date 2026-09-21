CREATE TABLE "anggota" (
	"id" serial PRIMARY KEY NOT NULL,
	"kelompok_id" integer NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	CONSTRAINT "anggota_nim_unique" UNIQUE("nim")
);
--> statement-breakpoint
CREATE TABLE "jawaban" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_id" integer NOT NULL,
	"soal_kode" text NOT NULL,
	"isi" text DEFAULT '' NOT NULL,
	"versi" integer DEFAULT 0 NOT NULL,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jawaban_sesi_kelompok_soal" UNIQUE("sesi_id","kelompok_id","soal_kode")
);
--> statement-breakpoint
CREATE TABLE "kelompok" (
	"id" serial PRIMARY KEY NOT NULL,
	"nomor" integer NOT NULL,
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kelompok_nomor_unique" UNIQUE("nomor")
);
--> statement-breakpoint
CREATE TABLE "sesi_kelompok" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_id" integer NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"peran" text,
	"catatan" text,
	CONSTRAINT "sesi_kelompok_unik" UNIQUE("sesi_id","kelompok_id")
);
--> statement-breakpoint
ALTER TABLE "sesi" DROP CONSTRAINT "sesi_slot_unik";--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "mulai_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "selesai_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "durasi_detik" integer;--> statement-breakpoint
ALTER TABLE "anggota" ADD CONSTRAINT "anggota_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jawaban" ADD CONSTRAINT "jawaban_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jawaban" ADD CONSTRAINT "jawaban_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_kelompok" ADD CONSTRAINT "sesi_kelompok_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_kelompok" ADD CONSTRAINT "sesi_kelompok_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jawaban_sesi_idx" ON "jawaban" USING btree ("sesi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sesi_slot_unik" ON "sesi" USING btree ("tanggal","modul","mulai") WHERE "sesi"."status" <> 'batal';