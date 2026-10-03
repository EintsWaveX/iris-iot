ALTER TABLE "server" ADD COLUMN "kondisi" jsonb;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "kondisi_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "riwayat_sejak" timestamp with time zone;