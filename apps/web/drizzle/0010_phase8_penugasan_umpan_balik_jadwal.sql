CREATE TABLE "jadwal" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"hari" integer NOT NULL,
	"slot" integer NOT NULL,
	"kelas" text DEFAULT 'reguler' NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"asisten" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pengganti" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jadwal_slot_unik" UNIQUE("semester","hari","slot")
);
--> statement-breakpoint
CREATE TABLE "sesi_asisten" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_id" integer NOT NULL,
	"asisten_nim" text NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesi_asisten_unik" UNIQUE("sesi_id","kelompok_id")
);
--> statement-breakpoint
CREATE TABLE "umpan_balik" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"nim" text NOT NULL,
	"asisten_nim" text NOT NULL,
	"rating_asisten" integer NOT NULL,
	"komentar_asisten" text,
	"chips_asisten" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating_lab" integer NOT NULL,
	"komentar_lab" text,
	"chips_lab" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "umpan_balik_sesi_nim" UNIQUE("sesi_id","nim")
);
--> statement-breakpoint
ALTER TABLE "sesi" ADD COLUMN "kelas" text DEFAULT 'reguler' NOT NULL;--> statement-breakpoint
ALTER TABLE "sesi_kelompok" ADD COLUMN "minta_bantuan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesi_asisten" ADD CONSTRAINT "sesi_asisten_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_asisten" ADD CONSTRAINT "sesi_asisten_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi_asisten" ADD CONSTRAINT "sesi_asisten_asisten_nim_asisten_nim_fk" FOREIGN KEY ("asisten_nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umpan_balik" ADD CONSTRAINT "umpan_balik_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umpan_balik" ADD CONSTRAINT "umpan_balik_asisten_nim_asisten_nim_fk" FOREIGN KEY ("asisten_nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "umpan_balik_asisten_idx" ON "umpan_balik" USING btree ("asisten_nim");