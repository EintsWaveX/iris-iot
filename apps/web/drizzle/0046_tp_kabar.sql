CREATE TABLE "tp_kabar" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer,
	"jenis" text NOT NULL,
	"sasaran" text DEFAULT 'semua' NOT NULL,
	"judul" jsonb NOT NULL,
	"isi" jsonb NOT NULL,
	"mulai" timestamp with time zone DEFAULT now() NOT NULL,
	"sampai" timestamp with time zone,
	"oleh" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tp_kabar_semester_idx" ON "tp_kabar" USING btree ("semester","mulai");