ALTER TABLE "rec_candidate" ADD COLUMN "ipk_x100" integer;--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD COLUMN "potensi_cut" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD COLUMN "revision_round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD CONSTRAINT "rec_candidate_ipk" CHECK ("rec_candidate"."ipk_x100" is null or ("rec_candidate"."ipk_x100" between 0 and 400));