CREATE TABLE "rec_score_freeze" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"stage" text DEFAULT 'tes_tulis' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	"note" text,
	"scores" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" text,
	"unfreeze_note" text
);
--> statement-breakpoint
ALTER TABLE "rec_score_freeze" ADD CONSTRAINT "rec_score_freeze_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rec_score_freeze_hidup" ON "rec_score_freeze" USING btree ("edition_id","stage") WHERE "rec_score_freeze"."superseded_at" is null;