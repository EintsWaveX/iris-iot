CREATE TABLE "rec_stage_proposal_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"proposal" text,
	"by_nim" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rec_stage_proposal_log" ADD CONSTRAINT "rec_stage_proposal_log_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_stage_proposal_log_idx" ON "rec_stage_proposal_log" USING btree ("candidate_id","stage","at");