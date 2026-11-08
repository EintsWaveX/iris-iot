CREATE TABLE "berkas" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"tipe" text NOT NULL,
	"ukuran" integer NOT NULL,
	"isi" bytea NOT NULL,
	"pemilik" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
