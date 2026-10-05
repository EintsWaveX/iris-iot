CREATE TABLE "kehadiran_asisten" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nim" text NOT NULL,
	"status" text NOT NULL,
	"datang_pada" timestamp with time zone,
	"telat_menit" integer,
	"otomatis" boolean DEFAULT true NOT NULL,
	"ditandai_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kehadiran_asisten_satu" UNIQUE("sesi_id","nim"),
	CONSTRAINT "kehadiran_asisten_status" CHECK ("kehadiran_asisten"."status" in ('tepat', 'mangkir_ngajar', 'mangkir'))
);
--> statement-breakpoint
ALTER TABLE "kehadiran_asisten" ADD CONSTRAINT "kehadiran_asisten_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kehadiran_asisten" ADD CONSTRAINT "kehadiran_asisten_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kehadiran_asisten_nim_idx" ON "kehadiran_asisten" USING btree ("nim");