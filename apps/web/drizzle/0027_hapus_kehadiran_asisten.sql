DROP TABLE "kehadiran_asisten" CASCADE;--> statement-breakpoint
DELETE FROM "audit" WHERE "aksi" IN ('kehadiran_asisten', 'kehadiran_kunci');