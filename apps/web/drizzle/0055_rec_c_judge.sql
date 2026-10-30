CREATE TABLE "rec_c_problem" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"title" text NOT NULL,
	"tier" text NOT NULL,
	"body" jsonb NOT NULL,
	"limits" jsonb DEFAULT '{"timeMs":1000,"memKb":65536}'::jsonb NOT NULL,
	"samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"checked_at" timestamp with time zone,
	"check_ok" boolean,
	"status" text DEFAULT 'draft' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"shown_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_c_submission" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"seat_id" integer,
	"room_id" integer,
	"problem_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'antre' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"retried" boolean DEFAULT false NOT NULL,
	"server_id" integer,
	"finished_at" timestamp with time zone,
	"outcome" jsonb,
	"passed" integer,
	"total" integer,
	"kode" text
);
--> statement-breakpoint
ALTER TABLE "rec_c_problem" ADD CONSTRAINT "rec_c_problem_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_c_submission" ADD CONSTRAINT "rec_c_submission_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_c_submission" ADD CONSTRAINT "rec_c_submission_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_c_submission" ADD CONSTRAINT "rec_c_submission_problem_id_rec_c_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."rec_c_problem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_c_problem_pool_idx" ON "rec_c_problem" USING btree ("edition_id","tier","status");--> statement-breakpoint
CREATE INDEX "rec_c_submission_queue_idx" ON "rec_c_submission" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "rec_c_submission_seat_idx" ON "rec_c_submission" USING btree ("seat_id","problem_id","kind","status");--> statement-breakpoint
-- The old Tes Tulis was C++ and Python with a Mikro part. Those questions stay in the table
-- (history) but become drafts so no room can deal them again.
UPDATE "rec_question" SET "status" = 'draft' WHERE "lang" <> 'c' OR "part" = 'mikro';
