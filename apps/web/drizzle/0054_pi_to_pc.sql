ALTER TABLE "konsol_pi" RENAME TO "konsol_pc";--> statement-breakpoint
ALTER SEQUENCE "konsol_pi_id_seq" RENAME TO "konsol_pc_id_seq";--> statement-breakpoint
ALTER INDEX "konsol_pi_pkey" RENAME TO "konsol_pc_pkey";--> statement-breakpoint
ALTER INDEX "konsol_pi_server_status_idx" RENAME TO "konsol_pc_server_status_idx";--> statement-breakpoint
ALTER TABLE "konsol_pc" RENAME CONSTRAINT "konsol_pi_kanal_unique" TO "konsol_pc_kanal_unique";--> statement-breakpoint
ALTER TABLE "konsol_pc" RENAME CONSTRAINT "konsol_pi_target" TO "konsol_pc_target";--> statement-breakpoint
ALTER TABLE "konsol_pc" RENAME CONSTRAINT "konsol_pi_status" TO "konsol_pc_status";--> statement-breakpoint
ALTER TABLE "konsol_pc" RENAME CONSTRAINT "konsol_pi_server_id_server_id_fk" TO "konsol_pc_server_id_server_id_fk";--> statement-breakpoint
ALTER TABLE "konsol_keberatan" RENAME CONSTRAINT "konsol_keberatan_konsol_id_konsol_pi_id_fk" TO "konsol_keberatan_konsol_id_konsol_pc_id_fk";--> statement-breakpoint
ALTER TABLE "konsol_peserta" RENAME CONSTRAINT "konsol_peserta_konsol_id_konsol_pi_id_fk" TO "konsol_peserta_konsol_id_konsol_pc_id_fk";--> statement-breakpoint
ALTER TABLE "konsol_tiket_nonce" RENAME CONSTRAINT "konsol_tiket_nonce_konsol_id_konsol_pi_id_fk" TO "konsol_tiket_nonce_konsol_id_konsol_pc_id_fk";--> statement-breakpoint
UPDATE "konsol_tiket_nonce" SET "peran" = 'pc' WHERE "peran" = 'pi';--> statement-breakpoint
UPDATE "pengaturan" SET "diubah_oleh" = 'pc' WHERE "diubah_oleh" = 'pi';
