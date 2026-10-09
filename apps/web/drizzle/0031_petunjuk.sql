CREATE TABLE "petunjuk_minta" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer,
	"kelompok_id" integer NOT NULL,
	"soal_kode" text NOT NULL,
	"catatan" text DEFAULT '' NOT NULL,
	"diminta_oleh" text,
	"diminta_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"teks" text,
	"dijawab_oleh" text,
	"dijawab_pada" timestamp with time zone,
	"batal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jawaban" ADD COLUMN "salah" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "petunjuk_minta" ADD CONSTRAINT "petunjuk_minta_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petunjuk_minta" ADD CONSTRAINT "petunjuk_minta_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "petunjuk_minta_sesi_idx" ON "petunjuk_minta" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "petunjuk_minta_kelompok_soal_idx" ON "petunjuk_minta" USING btree ("kelompok_id","soal_kode");--> statement-breakpoint
-- Wrong tries were never counted apart from right ones. A blank's checks
-- stop once it is right, so every check but the last right one was wrong.
UPDATE "jawaban" SET "salah" = GREATEST("percobaan" - CASE WHEN "benar" THEN 1 ELSE 0 END, 0);
