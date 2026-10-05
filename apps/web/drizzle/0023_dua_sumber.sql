DROP INDEX "presentasi_aktif_unik";--> statement-breakpoint
DROP INDEX "skema_aktif_per_modul";--> statement-breakpoint
CREATE UNIQUE INDEX "presentasi_aktif_per_jenis" ON "presentasi" USING btree ("jenis") WHERE "presentasi"."aktif" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "skema_aktif_per_modul_jenis" ON "skema" USING btree ("modul","jenis") WHERE "skema"."aktif" = true;