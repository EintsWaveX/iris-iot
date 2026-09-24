CREATE TABLE "arsip_praktikan" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"regu_id" integer NOT NULL,
	"tanggal" text NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	CONSTRAINT "arsip_praktikan_nim_per_hari" UNIQUE("tanggal","nim")
);
--> statement-breakpoint
CREATE TABLE "arsip_regu" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nomor" integer NOT NULL,
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "arsip_regu_nomor_per_sesi" UNIQUE("sesi_id","nomor")
);
--> statement-breakpoint
ALTER TABLE "arsip_praktikan" ADD CONSTRAINT "arsip_praktikan_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip_praktikan" ADD CONSTRAINT "arsip_praktikan_regu_id_arsip_regu_id_fk" FOREIGN KEY ("regu_id") REFERENCES "public"."arsip_regu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip_regu" ADD CONSTRAINT "arsip_regu_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arsip_praktikan_sesi_idx" ON "arsip_praktikan" USING btree ("sesi_id");