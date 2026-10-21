-- 2026-10-21, step 2 of 2: the LMS leaves IRIS. Only after the move
-- (tp-pindah, deploy 1) has every file in R2; refused otherwise.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tp_unggah" WHERE "kunci" IS NULL) THEN
    RAISE EXCEPTION 'tp_unggah rows without an R2 key remain: the move is not done';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "tp_kiriman", jsonb_array_elements("berkas") b
    WHERE b->>'url' NOT LIKE 'iris:%'
  ) THEN
    RAISE EXCEPTION 'tp_kiriman files still point at the LMS: the move is not done';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "lms_peserta" CASCADE;--> statement-breakpoint
DROP TABLE "tp_sinkron_log" CASCADE;--> statement-breakpoint
DROP INDEX "tp_unggah_lms_idx";--> statement-breakpoint
ALTER TABLE "tp_kiriman" ALTER COLUMN "sumber" SET DEFAULT 'iris';--> statement-breakpoint
ALTER TABLE "tp_jejak" DROP COLUMN "lms_kursus";--> statement-breakpoint
ALTER TABLE "tp_kiriman" DROP COLUMN "lms_kursus";--> statement-breakpoint
ALTER TABLE "tp_kiriman" DROP COLUMN "lms_tugas";--> statement-breakpoint
ALTER TABLE "tp_kiriman" DROP COLUMN "lms_kiriman";--> statement-breakpoint
ALTER TABLE "tp_kiriman" DROP COLUMN "status_lms";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "isi";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "lms_status";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "lms_galat";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "lms_coba";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "lms_pada";--> statement-breakpoint
ALTER TABLE "tp_unggah" DROP COLUMN "lms_url";--> statement-breakpoint
-- The LMS's settings, its token and web session among them, and the move's
-- progress.
DELETE FROM "pengaturan"
WHERE "kunci" LIKE 'lms\_%' OR "kunci" IN ('tp_pindah', 'tp_lms_tugas');--> statement-breakpoint
-- The lms right is the tp right now: an Admin's override moves with it.
UPDATE "asisten"
SET "hak_override" = ("hak_override" - 'lms') || jsonb_build_object('tp', "hak_override"->'lms')
WHERE "hak_override" ? 'lms';
