CREATE TABLE "rec_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"stage" text NOT NULL,
	"event_id" integer,
	"room" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	CONSTRAINT "rec_slot_kapasitas" CHECK ("rec_slot"."capacity" >= 0),
	CONSTRAINT "rec_slot_urut" CHECK ("rec_slot"."ends_at" > "rec_slot"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "rec_slot_assignment" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"via" text NOT NULL,
	"by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_slot_assignment_unik" UNIQUE("candidate_id","stage")
);
--> statement-breakpoint
CREATE TABLE "rec_slot_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"from_slot" integer,
	"to_slot" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rec_attendance" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD COLUMN "berkas_score" integer;--> statement-breakpoint
ALTER TABLE "rec_document" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "rec_document" ADD COLUMN "prev_r2_key" text;--> statement-breakpoint
ALTER TABLE "rec_document" ADD COLUMN "prev_size" integer;--> statement-breakpoint
ALTER TABLE "rec_document" ADD COLUMN "prev_sha256" text;--> statement-breakpoint
ALTER TABLE "rec_document" ADD COLUMN "prev_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rec_slot" ADD CONSTRAINT "rec_slot_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot" ADD CONSTRAINT "rec_slot_event_id_rec_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."rec_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_assignment" ADD CONSTRAINT "rec_slot_assignment_slot_id_rec_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."rec_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_assignment" ADD CONSTRAINT "rec_slot_assignment_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_change" ADD CONSTRAINT "rec_slot_change_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_change" ADD CONSTRAINT "rec_slot_change_from_slot_rec_slot_id_fk" FOREIGN KEY ("from_slot") REFERENCES "public"."rec_slot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_slot_change" ADD CONSTRAINT "rec_slot_change_to_slot_rec_slot_id_fk" FOREIGN KEY ("to_slot") REFERENCES "public"."rec_slot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_slot_stage_idx" ON "rec_slot" USING btree ("edition_id","stage","starts_at");--> statement-breakpoint
CREATE INDEX "rec_slot_assignment_slot_idx" ON "rec_slot_assignment" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_slot_change_satu_terbuka" ON "rec_slot_change" USING btree ("candidate_id","stage") WHERE "rec_slot_change"."status" = 'open';--> statement-breakpoint
CREATE INDEX "rec_slot_change_status_idx" ON "rec_slot_change" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD CONSTRAINT "rec_candidate_nilai_berkas" CHECK ("rec_candidate"."berkas_score" is null or ("rec_candidate"."berkas_score" between 0 and 100));
--> statement-breakpoint
-- Seed: the three Pilih Jadwal windows (PRD 3), skipped where they exist.
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")
SELECT (SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pick', 'Pilih Jadwal Tes Tulis', '2026-11-11', '2026-11-14', '19:00', '23:59', NULL, false, 'all', '["pick"]'::jsonb, 'tes_tulis', NULL, 25
WHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = 2026)
  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = 2026) AND "kind" = 'pick' AND "stage" = 'tes_tulis');
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")
SELECT (SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pick', 'Pilih Jadwal Wawancara', '2026-11-27', '2026-11-29', '19:00', '23:59', NULL, false, 'all', '["pick"]'::jsonb, 'wawancara', NULL, 26
WHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = 2026)
  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = 2026) AND "kind" = 'pick' AND "stage" = 'wawancara');
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")
SELECT (SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pick', 'Pilih Jadwal Mengajar', '2026-12-20', '2026-12-21', '19:00', '23:59', NULL, false, 'all', '["pick"]'::jsonb, 'mengajar', NULL, 27
WHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = 2026)
  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = 2026) AND "kind" = 'pick' AND "stage" = 'mengajar');
