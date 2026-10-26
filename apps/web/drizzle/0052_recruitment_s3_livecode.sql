CREATE TABLE "rec_compile_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"seat_id" integer,
	"room_id" integer NOT NULL,
	"board" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'antre' NOT NULL,
	"sketch" text NOT NULL,
	"header" text DEFAULT '' NOT NULL,
	"fqbn" text NOT NULL,
	"libs" text[] DEFAULT '{}'::text[] NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"retried" boolean DEFAULT false NOT NULL,
	"server_id" integer,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"log" text,
	"bin_key" text,
	"bin_size" integer,
	"sha256" text,
	"ms" integer,
	"kode" text
);
--> statement-breakpoint
CREATE TABLE "rec_lc_template" (
	"edition_id" integer NOT NULL,
	"key" text NOT NULL,
	"code" text NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_lc_template_edition_id_key_pk" PRIMARY KEY("edition_id","key")
);
--> statement-breakpoint
CREATE TABLE "rec_lc_topic" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"fits" text[] NOT NULL,
	"parts" text[] DEFAULT '{}'::text[] NOT NULL,
	"libs" text[] DEFAULT '{}'::text[] NOT NULL,
	"hints" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'chip' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_livecode" (
	"seat_id" integer PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"topic_id" integer,
	"protocol" text,
	"variant" text,
	"spins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"boards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mqtt" jsonb,
	"traffic_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_mqtt_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"op" text NOT NULL,
	"akun" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'antre' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"kode" text
);
--> statement-breakpoint
CREATE TABLE "rec_rubric" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"rows" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_rubric_unik" UNIQUE("edition_id","stage","kind")
);
--> statement-breakpoint
CREATE TABLE "rec_rubric_score" (
	"id" serial PRIMARY KEY NOT NULL,
	"rubric_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"grader_nim" text NOT NULL,
	"values" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_rubric_score_unik" UNIQUE("rubric_id","subject_id","grader_nim")
);
--> statement-breakpoint
ALTER TABLE "rec_compile_job" ADD CONSTRAINT "rec_compile_job_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_compile_job" ADD CONSTRAINT "rec_compile_job_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_lc_template" ADD CONSTRAINT "rec_lc_template_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_lc_topic" ADD CONSTRAINT "rec_lc_topic_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_livecode" ADD CONSTRAINT "rec_livecode_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_livecode" ADD CONSTRAINT "rec_livecode_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_livecode" ADD CONSTRAINT "rec_livecode_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_livecode" ADD CONSTRAINT "rec_livecode_topic_id_rec_lc_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."rec_lc_topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_mqtt_job" ADD CONSTRAINT "rec_mqtt_job_room_id_rec_exam_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rec_exam_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_rubric" ADD CONSTRAINT "rec_rubric_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_rubric_score" ADD CONSTRAINT "rec_rubric_score_rubric_id_rec_rubric_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rec_rubric"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_compile_job_queue_idx" ON "rec_compile_job" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "rec_compile_job_seat_idx" ON "rec_compile_job" USING btree ("seat_id","board","status");--> statement-breakpoint
CREATE INDEX "rec_lc_topic_edition_idx" ON "rec_lc_topic" USING btree ("edition_id","status");--> statement-breakpoint
CREATE INDEX "rec_livecode_room_idx" ON "rec_livecode" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "rec_mqtt_job_queue_idx" ON "rec_mqtt_job" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "rec_rubric_score_subject_idx" ON "rec_rubric_score" USING btree ("rubric_id","subject_id");