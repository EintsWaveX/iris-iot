DROP INDEX "presentasi_aktif_per_modul_jenis";--> statement-breakpoint
ALTER TABLE "presentasi" ADD COLUMN "bahasa" text DEFAULT 'id' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "presentasi_aktif_per_modul_jenis" ON "presentasi" USING btree ("modul","jenis","bahasa") WHERE "presentasi"."aktif" = true;