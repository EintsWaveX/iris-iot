CREATE TABLE "skema" (
	"id" serial PRIMARY KEY NOT NULL,
	"modul" integer NOT NULL,
	"nama_berkas" text NOT NULL,
	"url" text NOT NULL,
	"diunggah_oleh" text NOT NULL,
	"diunggah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"aktif" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "skema_aktif_per_modul" ON "skema" USING btree ("modul") WHERE "skema"."aktif" = true;