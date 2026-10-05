CREATE TABLE "kode_versi" (
	"id" serial PRIMARY KEY NOT NULL,
	"modul" integer NOT NULL,
	"nomor" integer,
	"status" text NOT NULL,
	"berkas" jsonb NOT NULL,
	"catatan" text,
	"dibuat_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah_oleh" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"terbit_oleh" text,
	"terbit_pada" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kode_versi_nomor" ON "kode_versi" USING btree ("modul","nomor");--> statement-breakpoint
CREATE UNIQUE INDEX "kode_versi_draf" ON "kode_versi" USING btree ("modul") WHERE "kode_versi"."status" = 'draf';--> statement-breakpoint
CREATE UNIQUE INDEX "kode_versi_terbit" ON "kode_versi" USING btree ("modul") WHERE "kode_versi"."status" = 'terbit';