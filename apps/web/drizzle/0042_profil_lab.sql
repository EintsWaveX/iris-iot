CREATE TABLE "profil_acara" (
	"id" serial PRIMARY KEY NOT NULL,
	"jenis" text NOT NULL,
	"judul" jsonb NOT NULL,
	"tempat" jsonb NOT NULL,
	"ringkasan" jsonb NOT NULL,
	"tanggal" date NOT NULL,
	"sampul_id" integer,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profil_acara_foto" (
	"id" serial PRIMARY KEY NOT NULL,
	"acara_id" integer NOT NULL,
	"foto_url" text NOT NULL,
	"foto_kecil_url" text NOT NULL,
	"alt" jsonb,
	"urutan" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profil_divisi" (
	"divisi" text PRIMARY KEY NOT NULL,
	"foto_url" text,
	"foto_kecil_url" text,
	"baris" jsonb,
	"deskripsi" jsonb,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profil_foto_bersama" (
	"id" serial PRIMARY KEY NOT NULL,
	"tahun" text NOT NULL,
	"foto_url" text NOT NULL,
	"foto_kecil_url" text NOT NULL,
	"keterangan" jsonb NOT NULL,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profil_foto_bersama_tahun_unique" UNIQUE("tahun")
);
--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "foto_url" text;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "foto_kecil_url" text;--> statement-breakpoint
ALTER TABLE "profil_acara_foto" ADD CONSTRAINT "profil_acara_foto_acara_id_profil_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."profil_acara"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profil_acara_jenis_idx" ON "profil_acara" USING btree ("jenis","tanggal");--> statement-breakpoint
CREATE INDEX "profil_acara_foto_acara_idx" ON "profil_acara_foto" USING btree ("acara_id","urutan");