CREATE TABLE "rec_answer" (
	"seat_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"part" text NOT NULL,
	"value" jsonb,
	"rev" integer DEFAULT 0 NOT NULL,
	"tab" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_answer_seat_id_question_id_pk" PRIMARY KEY("seat_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "rec_exam_config" (
	"edition_id" integer PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"salt" text NOT NULL,
	"locked_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_exam_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"who" text NOT NULL,
	"act" text NOT NULL,
	"params" jsonb,
	"seq" integer
);
--> statement-breakpoint
CREATE TABLE "rec_exam_room" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"slot_id" integer,
	"title" text NOT NULL,
	"rehearsal" boolean DEFAULT false NOT NULL,
	"state" jsonb NOT NULL,
	"master_seen_at" timestamp with time zone,
	"topic_next" integer DEFAULT 0 NOT NULL,
	"hotspots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_exam_room_slot_id_unique" UNIQUE("slot_id")
);
--> statement-breakpoint
CREATE TABLE "rec_exam_seat" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"rehearsal" boolean DEFAULT false NOT NULL,
	"checkin" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"done" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tab" text,
	"tab_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "rec_exam_seat_unik" UNIQUE("edition_id","candidate_id","rehearsal")
);
--> statement-breakpoint
CREATE TABLE "rec_kit_loan" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"kit_code" text NOT NULL,
	"boards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lent_by" text,
	"lent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_to" text,
	CONSTRAINT "rec_kit_loan_unik" UNIQUE("room_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "rec_part_ref" (
	"edition_id" integer NOT NULL,
	"part" text NOT NULL,
	"reference_id" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rec_part_ref_edition_id_part_reference_id_pk" PRIMARY KEY("edition_id","part","reference_id")
);
--> statement-breakpoint
CREATE TABLE "rec_question" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"part" text NOT NULL,
	"lang" text NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"refs" integer[] DEFAULT '{}'::int[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"shown_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_note" text,
	"created_by" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_question_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"who" text NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_reference" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"selector" text,
	"r2_key" text,
	"sha256" text,
	"bytes" integer,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone,
	"by" text
);
--> statement-breakpoint
CREATE TABLE "rec_seat_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"author_nim" text NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_seat_note_unik" UNIQUE("room_id","candidate_id","author_nim")
);
--> statement-breakpoint
CREATE TABLE "rec_slot_examiner" (
	"slot_id" integer NOT NULL,
	"asisten_nim" text NOT NULL,
	"role" text DEFAULT 'pengawas' NOT NULL,
	CONSTRAINT "rec_slot_examiner_slot_id_asisten_nim_role_pk" PRIMARY KEY("slot_id","asisten_nim","role")
);
--> statement-breakpoint
CREATE TABLE "rec_strike" (
	"id" serial PRIMARY KEY NOT NULL,
	"seat_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"part" text NOT NULL,
	"client_id" text NOT NULL,
	"kinds" text[] NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"back_at" timestamp with time zone,
	CONSTRAINT "rec_strike_unik" UNIQUE("seat_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "rec_answer" ADD CONSTRAINT "rec_answer_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_answer" ADD CONSTRAINT "rec_answer_question_id_rec_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."rec_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_config" ADD CONSTRAINT "rec_exam_config_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_log" ADD CONSTRAINT "rec_exam_log_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_room" ADD CONSTRAINT "rec_exam_room_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_room" ADD CONSTRAINT "rec_exam_room_slot_id_rec_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."rec_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_seat" ADD CONSTRAINT "rec_exam_seat_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_seat" ADD CONSTRAINT "rec_exam_seat_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_exam_seat" ADD CONSTRAINT "rec_exam_seat_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_kit_loan" ADD CONSTRAINT "rec_kit_loan_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_kit_loan" ADD CONSTRAINT "rec_kit_loan_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_part_ref" ADD CONSTRAINT "rec_part_ref_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_part_ref" ADD CONSTRAINT "rec_part_ref_reference_id_rec_reference_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."rec_reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_question" ADD CONSTRAINT "rec_question_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_question_log" ADD CONSTRAINT "rec_question_log_question_id_rec_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."rec_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_reference" ADD CONSTRAINT "rec_reference_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_seat_note" ADD CONSTRAINT "rec_seat_note_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_seat_note" ADD CONSTRAINT "rec_seat_note_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_examiner" ADD CONSTRAINT "rec_slot_examiner_slot_id_rec_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."rec_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_examiner" ADD CONSTRAINT "rec_slot_examiner_asisten_nim_asisten_nim_fk" FOREIGN KEY ("asisten_nim") REFERENCES "public"."asisten"("nim") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_strike" ADD CONSTRAINT "rec_strike_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_strike" ADD CONSTRAINT "rec_strike_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_exam_log_room_idx" ON "rec_exam_log" USING btree ("room_id","at");--> statement-breakpoint
CREATE INDEX "rec_exam_room_edition_idx" ON "rec_exam_room" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "rec_exam_seat_room_idx" ON "rec_exam_seat" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "rec_question_part_idx" ON "rec_question" USING btree ("edition_id","part","status");--> statement-breakpoint
CREATE INDEX "rec_question_log_question_idx" ON "rec_question_log" USING btree ("question_id","at");--> statement-breakpoint
CREATE INDEX "rec_reference_edition_idx" ON "rec_reference" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "rec_strike_room_idx" ON "rec_strike" USING btree ("room_id","at");