CREATE TABLE "lms_peserta" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"nim" text NOT NULL,
	"lms_user" integer NOT NULL,
	"lms_kursus" integer NOT NULL,
	"kursus" text NOT NULL,
	"diperbarui" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lms_peserta_unik" UNIQUE("semester","nim")
);
--> statement-breakpoint
CREATE TABLE "tp_jawaban" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"nomor" integer NOT NULL,
	"isi" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tp_jawaban_unik" UNIQUE("semester","modul","nim","nomor")
);
--> statement-breakpoint
CREATE TABLE "tp_kiriman" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"lms_kursus" integer,
	"lms_tugas" integer,
	"lms_kiriman" integer,
	"status_lms" text,
	"berkas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dikirim_pada" timestamp with time zone,
	"diambil_pada" timestamp with time zone,
	"sinkron_pada" timestamp with time zone,
	"terima_telat" boolean,
	"tanda" text,
	"ditandai_oleh" text,
	CONSTRAINT "tp_kiriman_unik" UNIQUE("semester","modul","nim")
);
--> statement-breakpoint
CREATE TABLE "tp_nilai" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"nomor" integer NOT NULL,
	"skor" real NOT NULL,
	"catatan" text,
	"diubah_oleh" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tp_nilai_unik" UNIQUE("semester","modul","nim","nomor")
);
--> statement-breakpoint
CREATE TABLE "tp_paket" (
	"modul" integer PRIMARY KEY NOT NULL,
	"varian" jsonb NOT NULL,
	"pilih" jsonb NOT NULL,
	"petunjuk" jsonb NOT NULL,
	"versi" integer DEFAULT 1 NOT NULL,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tp_sinkron_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"mulai" timestamp with time zone DEFAULT now() NOT NULL,
	"oleh" text NOT NULL,
	"hasil" text NOT NULL,
	"baru" integer DEFAULT 0 NOT NULL,
	"diperbarui" integer DEFAULT 0 NOT NULL,
	"durasi_ms" integer DEFAULT 0 NOT NULL,
	"galat" text
);
--> statement-breakpoint
CREATE INDEX "lms_peserta_user_idx" ON "lms_peserta" USING btree ("lms_user");--> statement-breakpoint
CREATE INDEX "tp_kiriman_modul_idx" ON "tp_kiriman" USING btree ("semester","modul");--> statement-breakpoint
CREATE INDEX "tp_nilai_modul_idx" ON "tp_nilai" USING btree ("semester","modul");--> statement-breakpoint
CREATE INDEX "tp_sinkron_log_mulai_idx" ON "tp_sinkron_log" USING btree ("mulai");