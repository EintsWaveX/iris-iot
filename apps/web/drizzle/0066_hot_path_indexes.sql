CREATE INDEX IF NOT EXISTS "audit_aksi_id_idx" ON "audit" USING btree ("aksi","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "percobaan_sesi_idx" ON "percobaan_masuk" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sesi_berjalan_idx" ON "sesi" USING btree ("dibuat_pada") WHERE "sesi"."status" = 'berjalan';