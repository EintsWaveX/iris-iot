CREATE TABLE "rec_seat_penalty" (
	"id" serial PRIMARY KEY NOT NULL,
	"seat_id" integer NOT NULL,
	"part" text NOT NULL,
	"state" text NOT NULL,
	"pct" integer DEFAULT 0 NOT NULL,
	"by_nim" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_seat_penalty_unik" UNIQUE("seat_id","part")
);
--> statement-breakpoint
CREATE TABLE "rec_seat_warning" (
	"id" serial PRIMARY KEY NOT NULL,
	"seat_id" integer NOT NULL,
	"part" text,
	"source" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"cut" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"by_nim" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rec_exam_seat" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rec_exam_seat" ADD COLUMN "strike_overflow" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rec_strike" ADD COLUMN "excused_by" text;--> statement-breakpoint
ALTER TABLE "rec_strike" ADD COLUMN "excused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rec_strike" ADD COLUMN "excuse_reason" text;--> statement-breakpoint
ALTER TABLE "rec_seat_penalty" ADD CONSTRAINT "rec_seat_penalty_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_seat_warning" ADD CONSTRAINT "rec_seat_warning_seat_id_rec_exam_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."rec_exam_seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_seat_warning_seat_idx" ON "rec_seat_warning" USING btree ("seat_id","at");