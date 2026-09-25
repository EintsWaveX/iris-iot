CREATE TABLE "nilai" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nim" text NOT NULL,
	"komponen" text NOT NULL,
	"skor" integer NOT NULL,
	"diubah_oleh" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nilai_sesi_nim_komponen" UNIQUE("sesi_id","nim","komponen")
);
--> statement-breakpoint
ALTER TABLE "nilai" ADD CONSTRAINT "nilai_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nilai_sesi_idx" ON "nilai" USING btree ("sesi_id");