CREATE TABLE "rec_sheet" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"grader_nim" text NOT NULL,
	"levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_sheet_unik" UNIQUE("candidate_id","stage","grader_nim")
);
--> statement-breakpoint
CREATE TABLE "rec_sheet_shared" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concl" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"other" text DEFAULT '' NOT NULL,
	"verdict" text,
	"ba" text DEFAULT '' NOT NULL,
	"recording" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"case_info" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_sheet_shared_unik" UNIQUE("candidate_id","stage")
);
--> statement-breakpoint
ALTER TABLE "rec_slot_examiner" ADD COLUMN "pos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rec_sheet" ADD CONSTRAINT "rec_sheet_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_sheet_shared" ADD CONSTRAINT "rec_sheet_shared_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;