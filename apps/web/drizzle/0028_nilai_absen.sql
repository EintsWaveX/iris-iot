CREATE TABLE "nilai_absen" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nim" text NOT NULL,
	"ditandai_oleh" text NOT NULL,
	"ditandai_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nilai_absen_sesi_nim" UNIQUE("sesi_id","nim")
);
--> statement-breakpoint
ALTER TABLE "nilai_absen" ADD CONSTRAINT "nilai_absen_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;