CREATE TABLE "asisten" (
	"nim" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kode" text NOT NULL,
	"divisi_id" text NOT NULL,
	"divisi_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL,
	"aktor_nim" text NOT NULL,
	"aksi" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "percobaan_masuk" (
	"id" serial PRIMARY KEY NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL,
	"nim" text NOT NULL,
	"ip" text NOT NULL,
	"jenis" text NOT NULL,
	"berhasil" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "praktikan" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"regu_id" integer NOT NULL,
	"tanggal" text NOT NULL,
	"nim" text NOT NULL,
	"nama" text NOT NULL,
	CONSTRAINT "praktikan_nim_per_hari" UNIQUE("tanggal","nim")
);
--> statement-breakpoint
CREATE TABLE "regu" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nomor" integer NOT NULL,
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regu_nomor_per_sesi" UNIQUE("sesi_id","nomor")
);
--> statement-breakpoint
CREATE TABLE "sesi" (
	"id" serial PRIMARY KEY NOT NULL,
	"tanggal" text NOT NULL,
	"mulai" text NOT NULL,
	"modul" integer NOT NULL,
	"status" text DEFAULT 'terjadwal' NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesi_slot_unik" UNIQUE("tanggal","modul","mulai")
);
--> statement-breakpoint
ALTER TABLE "praktikan" ADD CONSTRAINT "praktikan_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "praktikan" ADD CONSTRAINT "praktikan_regu_id_regu_id_fk" FOREIGN KEY ("regu_id") REFERENCES "public"."regu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regu" ADD CONSTRAINT "regu_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_pada_idx" ON "audit" USING btree ("pada");--> statement-breakpoint
CREATE INDEX "percobaan_nim_idx" ON "percobaan_masuk" USING btree ("nim","pada");--> statement-breakpoint
CREATE INDEX "percobaan_ip_idx" ON "percobaan_masuk" USING btree ("ip","pada");--> statement-breakpoint
CREATE INDEX "praktikan_sesi_idx" ON "praktikan" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "sesi_tanggal_idx" ON "sesi" USING btree ("tanggal");