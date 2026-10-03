ALTER TABLE "telemetri_log" ALTER COLUMN "snr" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "telemetri_terkini" ALTER COLUMN "snr" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "telemetri_log" ADD COLUMN "nilai" jsonb;--> statement-breakpoint
ALTER TABLE "telemetri_terkini" ADD COLUMN "nilai" jsonb;