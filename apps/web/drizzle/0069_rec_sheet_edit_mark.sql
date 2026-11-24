ALTER TABLE "rec_sheet" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rec_sheet" ADD COLUMN "edit_count" integer DEFAULT 0 NOT NULL;