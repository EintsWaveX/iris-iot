ALTER TABLE "server" ADD COLUMN "perburuan" jsonb;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "perburuan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "hotspot" jsonb;