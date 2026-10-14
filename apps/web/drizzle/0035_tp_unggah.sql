CREATE TABLE "tp_unggah" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	"ukuran" integer NOT NULL,
	"sha256" text NOT NULL,
	"isi" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"lms_status" text DEFAULT 'menunggu' NOT NULL,
	"lms_galat" text,
	"lms_coba" integer DEFAULT 0 NOT NULL,
	"lms_pada" timestamp with time zone,
	"lms_url" text
);
--> statement-breakpoint
ALTER TABLE "tp_kiriman" ADD COLUMN "sumber" text DEFAULT 'lms' NOT NULL;--> statement-breakpoint
ALTER TABLE "tp_kiriman" ADD COLUMN "unggah_id" integer;--> statement-breakpoint
CREATE INDEX "tp_unggah_nim_idx" ON "tp_unggah" USING btree ("semester","modul","nim");--> statement-breakpoint
CREATE INDEX "tp_unggah_lms_idx" ON "tp_unggah" USING btree ("lms_status");