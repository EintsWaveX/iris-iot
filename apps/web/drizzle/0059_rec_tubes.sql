CREATE TABLE "rec_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"leader_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"topic_id" integer,
	"drawn_at" timestamp with time zone,
	"session_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"override_note" text,
	"override_by" text,
	"override_until" timestamp with time zone,
	"override_at" timestamp with time zone,
	CONSTRAINT "rec_team_pemimpin_unik" UNIQUE("edition_id","leader_id")
);
--> statement-breakpoint
CREATE TABLE "rec_team_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_team_member_unik" UNIQUE("team_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "rec_tubes_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"part" text NOT NULL,
	"kind" text NOT NULL,
	"key" text,
	"url" text,
	"name" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"sha256" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	CONSTRAINT "rec_tubes_file_unik" UNIQUE("team_id","part")
);
--> statement-breakpoint
CREATE TABLE "rec_tubes_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"place" text DEFAULT 'Lab IRIS' NOT NULL,
	CONSTRAINT "rec_tubes_session_kapasitas" CHECK ("rec_tubes_session"."capacity" >= 0),
	CONSTRAINT "rec_tubes_session_urut" CHECK ("rec_tubes_session"."ends_at" > "rec_tubes_session"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "rec_tubes_state" (
	"edition_id" integer PRIMARY KEY NOT NULL,
	"topics_published_at" timestamp with time zone,
	"topics_published_by" text,
	"teams_lock" text
);
--> statement-breakpoint
CREATE TABLE "rec_tubes_topic" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"cap" integer DEFAULT 3 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rec_tubes_topic_cap" CHECK ("rec_tubes_topic"."cap" >= 1)
);
--> statement-breakpoint
ALTER TABLE "rec_team" ADD CONSTRAINT "rec_team_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_team" ADD CONSTRAINT "rec_team_leader_id_rec_candidate_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_team" ADD CONSTRAINT "rec_team_topic_id_rec_tubes_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."rec_tubes_topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_team" ADD CONSTRAINT "rec_team_session_id_rec_tubes_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."rec_tubes_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_team_member" ADD CONSTRAINT "rec_team_member_team_id_rec_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."rec_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_team_member" ADD CONSTRAINT "rec_team_member_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_tubes_file" ADD CONSTRAINT "rec_tubes_file_team_id_rec_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."rec_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_tubes_session" ADD CONSTRAINT "rec_tubes_session_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_tubes_state" ADD CONSTRAINT "rec_tubes_state_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_tubes_topic" ADD CONSTRAINT "rec_tubes_topic_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rec_team_member_satu_tim" ON "rec_team_member" USING btree ("candidate_id") WHERE "rec_team_member"."status" = 'joined';--> statement-breakpoint
CREATE INDEX "rec_tubes_session_idx" ON "rec_tubes_session" USING btree ("edition_id","starts_at");--> statement-breakpoint
CREATE INDEX "rec_tubes_topic_idx" ON "rec_tubes_topic" USING btree ("edition_id","sort");