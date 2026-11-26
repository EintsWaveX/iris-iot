CREATE TABLE "rec_iv_audio" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"recorded_by" text NOT NULL,
	"mime" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"size" integer NOT NULL,
	"isi" "bytea" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rec_iv_audio" ADD CONSTRAINT "rec_iv_audio_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_iv_audio_kandidat_idx" ON "rec_iv_audio" USING btree ("candidate_id","stage","started_at");