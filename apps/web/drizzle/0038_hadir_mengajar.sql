CREATE TABLE "hadir_jam" (
	"kunci" text PRIMARY KEY NOT NULL,
	"base_menit" integer NOT NULL,
	"dari_menit" integer NOT NULL,
	"alasan" text NOT NULL,
	"oleh" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hadir_mengajar" (
	"id" serial PRIMARY KEY NOT NULL,
	"kunci" text NOT NULL,
	"tanggal" text NOT NULL,
	"jadwal_id" integer,
	"sesi_id" integer,
	"nim" text NOT NULL,
	"diharapkan" boolean DEFAULT false NOT NULL,
	"hadir_pada" timestamp with time zone,
	"ubah_status" text,
	"ubah_menit" integer,
	"hitung_mangkir" boolean DEFAULT true NOT NULL,
	"alasan" text,
	"ambil_alih_dijawab" boolean DEFAULT false NOT NULL,
	"diubah_oleh" text,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hadir_mengajar_satu" UNIQUE("kunci","nim")
);
--> statement-breakpoint
CREATE TABLE "lupa_nilai" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"nim" text NOT NULL,
	"kurang" jsonb NOT NULL,
	"dicatat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"menyusul_pada" timestamp with time zone,
	CONSTRAINT "lupa_nilai_satu" UNIQUE("sesi_id","kelompok_nomor")
);
--> statement-breakpoint
ALTER TABLE "jadwal" ADD COLUMN "pj" text;--> statement-breakpoint
ALTER TABLE "hadir_mengajar" ADD CONSTRAINT "hadir_mengajar_jadwal_id_jadwal_id_fk" FOREIGN KEY ("jadwal_id") REFERENCES "public"."jadwal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hadir_mengajar" ADD CONSTRAINT "hadir_mengajar_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hadir_mengajar" ADD CONSTRAINT "hadir_mengajar_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lupa_nilai" ADD CONSTRAINT "lupa_nilai_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hadir_mengajar_nim_idx" ON "hadir_mengajar" USING btree ("nim");--> statement-breakpoint
CREATE INDEX "hadir_mengajar_tanggal_idx" ON "hadir_mengajar" USING btree ("tanggal");--> statement-breakpoint
CREATE INDEX "hadir_mengajar_sesi_idx" ON "hadir_mengajar" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "lupa_nilai_nim_idx" ON "lupa_nilai" USING btree ("nim");