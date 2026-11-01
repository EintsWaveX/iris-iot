CREATE TABLE "rec_makeup" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"from_slot_id" integer,
	"status" text DEFAULT 'tawar' NOT NULL,
	"via" text DEFAULT 'web' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"answered_by" text,
	"offered_by" text NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"reinstated_at" timestamp with time zone,
	CONSTRAINT "rec_makeup_unik" UNIQUE("candidate_id","stage")
);
--> statement-breakpoint
ALTER TABLE "rec_makeup" ADD CONSTRAINT "rec_makeup_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;