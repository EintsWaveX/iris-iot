CREATE TABLE "jabatan_pemegang" (
	"id" serial PRIMARY KEY NOT NULL,
	"kategori" text NOT NULL,
	"nim" text NOT NULL,
	"mulai" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai" timestamp with time zone,
	"diberikan_oleh" text
);
--> statement-breakpoint
CREATE TABLE "serah_terima" (
	"id" serial PRIMARY KEY NOT NULL,
	"kategori" text NOT NULL,
	"dari_nim" text NOT NULL,
	"ke_nim" text NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"diminta_oleh" text NOT NULL,
	"diputus_oleh" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diputus_pada" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "divisi" text;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "tier" text DEFAULT 'asisten' NOT NULL;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "badges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "status" text DEFAULT 'aktif' NOT NULL;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "seelabs_akun" text;--> statement-breakpoint
ALTER TABLE "asisten" ADD COLUMN "hak_override" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jabatan_pemegang" ADD CONSTRAINT "jabatan_pemegang_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jabatan_pemegang_satu_pemegang" ON "jabatan_pemegang" USING btree ("kategori") WHERE "jabatan_pemegang"."selesai" IS NULL;--> statement-breakpoint
CREATE INDEX "jabatan_pemegang_nim" ON "jabatan_pemegang" USING btree ("nim");--> statement-breakpoint
CREATE UNIQUE INDEX "serah_terima_satu_menunggu" ON "serah_terima" USING btree ("kategori") WHERE "serah_terima"."status" = 'menunggu';--> statement-breakpoint
-- Phase 9 Stage 2 data (hand-written; every step is safe to re-run).
-- 1. Code renames ruled in the Stage 0 mockup rounds: RGZ is REG (Rega
--    Arzula Akbar) and FAT is TIR (Moh. Fathirochman Yasin), matching the
--    schedule sheet. The schedule's jsonb code lists follow.
UPDATE "asisten" SET "kode" = 'REG' WHERE "kode" = 'RGZ';--> statement-breakpoint
UPDATE "asisten" SET "kode" = 'TIR' WHERE "kode" = 'FAT';--> statement-breakpoint
UPDATE "jadwal" SET "asisten" = replace(replace("asisten"::text, '"RGZ"', '"REG"'), '"FAT"', '"TIR"')::jsonb
  WHERE "asisten"::text LIKE '%"RGZ"%' OR "asisten"::text LIKE '%"FAT"%';--> statement-breakpoint
UPDATE "jadwal" SET "pengganti" = replace(replace("pengganti"::text, '"RGZ"', '"REG"'), '"FAT"', '"TIR"')::jsonb
  WHERE "pengganti"::text LIKE '%"RGZ"%' OR "pengganti"::text LIKE '%"FAT"%';--> statement-breakpoint
-- 2. NUE's full name, as corrected in round 2.
UPDATE "asisten" SET "nama" = 'Immanuel Eben Haezer Joseph Aletheia' WHERE "kode" = 'NUE';--> statement-breakpoint
-- 3. The division code from the handbook position ("Kepala Divisi ASO",
--    "Anggota Divisi ASO"); the Inti have none.
UPDATE "asisten" SET "divisi" = substring("divisi_id" from '(ASO|ARD|ADS|ADC|AER|ARM)$')
  WHERE "divisi" IS NULL;--> statement-breakpoint
-- 4. The ten head roles, held since the handbook date (31 August 2026).
INSERT INTO "jabatan_pemegang" ("kategori", "nim", "mulai")
  SELECT CASE "divisi_id"
           WHEN 'Koordinator Asisten' THEN 'ketua'
           WHEN 'Wakil Koordinator Asisten' THEN 'wakil'
           WHEN 'Sekretaris' THEN 'sekretaris'
           WHEN 'Bendahara' THEN 'bendahara'
           ELSE 'kepala-' || "divisi"
         END,
         "nim", '2026-08-31T00:00:00+07:00'
  FROM "asisten"
  WHERE "divisi_id" IN ('Koordinator Asisten', 'Wakil Koordinator Asisten', 'Sekretaris', 'Bendahara')
     OR ("divisi_id" LIKE 'Kepala Divisi %' AND "divisi" IS NOT NULL)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- 5. The tier follows the open head role: Inti are Admin, Kepala are
--    Pengelola, everyone else stays Asisten (the column default).
UPDATE "asisten" a SET "tier" = CASE WHEN j."kategori" IN ('ketua', 'wakil', 'sekretaris', 'bendahara') THEN 'admin' ELSE 'pengelola' END
  FROM "jabatan_pemegang" j
  WHERE j."nim" = a."nim" AND j."selesai" IS NULL;--> statement-breakpoint
-- 6. Badges: DEV for the ASO and ARM divisions; Pencipta for NUE.
UPDATE "asisten" SET "badges" = '["dev"]'::jsonb WHERE "divisi" IN ('ASO', 'ARM') AND "badges" = '[]'::jsonb;--> statement-breakpoint
UPDATE "asisten" SET "badges" = '["pencipta","dev"]'::jsonb WHERE "kode" = 'NUE';
