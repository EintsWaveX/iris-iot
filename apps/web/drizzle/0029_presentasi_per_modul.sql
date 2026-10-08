DROP INDEX "presentasi_aktif_per_jenis";--> statement-breakpoint
ALTER TABLE "presentasi" ADD COLUMN "modul" integer;--> statement-breakpoint
-- Decks go per module (2026-10-08). The active ones belong to the module
-- running now; every other deck waits, inactive, for an Asisten to give it
-- a module in Persiapan > Presentasi.
UPDATE "presentasi" SET "modul" = (SELECT "modul" FROM "sesi" WHERE "status" = 'berjalan' ORDER BY "id" DESC LIMIT 1) WHERE "aktif" = true;--> statement-breakpoint
UPDATE "presentasi" SET "aktif" = false WHERE "modul" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "presentasi_aktif_per_modul_jenis" ON "presentasi" USING btree ("modul","jenis") WHERE "presentasi"."aktif" = true;
