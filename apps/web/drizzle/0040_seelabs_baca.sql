CREATE TABLE "seelabs_baca" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"akun_nim" text NOT NULL,
	"status" text NOT NULL,
	"seelabs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dibaca_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seelabs_baca_kelompok" UNIQUE("sesi_id","kelompok_nomor")
);
--> statement-breakpoint
CREATE TABLE "seelabs_bap_beda" (
	"id" serial PRIMARY KEY NOT NULL,
	"akun_nim" text NOT NULL,
	"praktikum" integer NOT NULL,
	"tanggal" text NOT NULL,
	"shift" integer NOT NULL,
	"jenis" text NOT NULL,
	"penilai" text[] DEFAULT '{}'::text[] NOT NULL,
	"dibaca_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seelabs_bap_beda_unik" UNIQUE("akun_nim","praktikum","tanggal","shift")
);
--> statement-breakpoint
CREATE TABLE "seelabs_lepas" (
	"id" serial PRIMARY KEY NOT NULL,
	"akun_nim" text NOT NULL,
	"praktikum" integer NOT NULL,
	"klp" integer NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"nilai" jsonb NOT NULL,
	"dibaca_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seelabs_lepas_unik" UNIQUE("akun_nim","praktikum","modul","nim")
);
--> statement-breakpoint
ALTER TABLE "seelabs_ekspor" ADD COLUMN "nilai" jsonb;--> statement-breakpoint
ALTER TABLE "seelabs_baca" ADD CONSTRAINT "seelabs_baca_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;