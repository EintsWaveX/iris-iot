CREATE TABLE "konsol_peserta" (
	"id" serial PRIMARY KEY NOT NULL,
	"konsol_id" integer NOT NULL,
	"nim" text NOT NULL,
	"status" text DEFAULT 'diminta' NOT NULL,
	"alasan" text,
	"tanpa_persetujuan" boolean DEFAULT false NOT NULL,
	"disetujui_oleh" text,
	"diminta_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dijawab_pada" timestamp with time zone,
	CONSTRAINT "konsol_peserta_satu" UNIQUE("konsol_id","nim"),
	CONSTRAINT "konsol_peserta_status" CHECK ("konsol_peserta"."status" in ('diminta', 'disetujui', 'ditolak'))
);
--> statement-breakpoint
ALTER TABLE "konsol_peserta" ADD CONSTRAINT "konsol_peserta_konsol_id_konsol_pi_id_fk" FOREIGN KEY ("konsol_id") REFERENCES "public"."konsol_pi"("id") ON DELETE cascade ON UPDATE no action;