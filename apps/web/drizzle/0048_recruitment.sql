CREATE TABLE "rec_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"via" text NOT NULL,
	"by" text,
	CONSTRAINT "rec_attendance_unik" UNIQUE("candidate_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "rec_candidate" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"nim" text NOT NULL,
	"anggota_id" integer,
	"biodata" jsonb NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"current_stage" text DEFAULT 'berkas' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "rec_candidate_unik" UNIQUE("edition_id","nim")
);
--> statement-breakpoint
CREATE TABLE "rec_committee" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"asisten_nim" text NOT NULL,
	"division" text NOT NULL,
	"is_koor" boolean DEFAULT false NOT NULL,
	"title" text,
	"seated_by" text NOT NULL,
	"seated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_committee_unik" UNIQUE("edition_id","asisten_nim")
);
--> statement-breakpoint
CREATE TABLE "rec_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"kind" text NOT NULL,
	"r2_key" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "rec_document_unik" UNIQUE("candidate_id","kind")
);
--> statement-breakpoint
CREATE TABLE "rec_edition" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_edition_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "rec_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"day_start" text,
	"day_end" text,
	"place" text,
	"internal" boolean DEFAULT false NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"gates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stage" text,
	"color" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_event_urut" CHECK ("rec_event"."ends_on" >= "rec_event"."starts_on"),
	CONSTRAINT "rec_event_jam" CHECK (("rec_event"."day_start" is null and "rec_event"."day_end" is null) or ("rec_event"."day_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "rec_event"."day_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "rec_event"."day_end" > "rec_event"."day_start"))
);
--> statement-breakpoint
CREATE TABLE "rec_event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"who" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_stage_result" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text NOT NULL,
	"proposal" text,
	"proposed_by" text,
	"note" text,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"reveal_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	CONSTRAINT "rec_stage_result_unik" UNIQUE("candidate_id","stage")
);
--> statement-breakpoint
ALTER TABLE "rec_attendance" ADD CONSTRAINT "rec_attendance_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_attendance" ADD CONSTRAINT "rec_attendance_event_id_rec_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."rec_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_candidate" ADD CONSTRAINT "rec_candidate_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_committee" ADD CONSTRAINT "rec_committee_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_committee" ADD CONSTRAINT "rec_committee_asisten_nim_asisten_nim_fk" FOREIGN KEY ("asisten_nim") REFERENCES "public"."asisten"("nim") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_document" ADD CONSTRAINT "rec_document_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_event" ADD CONSTRAINT "rec_event_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_stage_result" ADD CONSTRAINT "rec_stage_result_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_candidate_status_idx" ON "rec_candidate" USING btree ("edition_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_committee_satu_ketua" ON "rec_committee" USING btree ("edition_id") WHERE "rec_committee"."division" = 'ketua';--> statement-breakpoint
CREATE UNIQUE INDEX "rec_committee_satu_koor" ON "rec_committee" USING btree ("edition_id","division") WHERE "rec_committee"."is_koor";--> statement-breakpoint
CREATE INDEX "rec_event_edition_idx" ON "rec_event" USING btree ("edition_id","starts_on");--> statement-breakpoint
CREATE INDEX "rec_event_log_event_idx" ON "rec_event_log" USING btree ("event_id","at");
--> statement-breakpoint
-- Seed: the 2026 edition and its calendar (PRD 3). No committee members.
INSERT INTO "rec_edition" ("year", "title", "status") VALUES (2026, 'Open Recruitment Asisten IRIS 2026', 'live');
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort") VALUES
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'registration', 'Open Recruitment', '2026-10-25', '2026-10-31', NULL, NULL, NULL, false, 'all', '["daftar"]'::jsonb, 'berkas', NULL, 0),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'registration', 'Extend', '2026-11-01', '2026-11-02', NULL, NULL, NULL, false, 'all', '["daftar"]'::jsonb, 'berkas', NULL, 1),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'review', 'Pengecekan Berkas', '2026-11-09', '2026-11-10', NULL, NULL, NULL, true, 'all', '["review"]'::jsonb, 'berkas', NULL, 2),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Berkas', '2026-11-11', '2026-11-11', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'berkas', NULL, 3),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'meeting', 'First Meet', '2026-11-12', '2026-11-12', '18:30', '21:00', 'TULT', false, 'all', '["qr"]'::jsonb, 'first_meet', NULL, 4),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pleno', 'Pleno Tes Tulis', '2026-11-16', '2026-11-16', NULL, NULL, NULL, true, 'all', '[]'::jsonb, 'tes_tulis', NULL, 5),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'test', 'Tes Tulis & Program', '2026-11-17', '2026-11-19', '18:30', '21:00', 'TULT', false, 'own', '["exam"]'::jsonb, 'tes_tulis', NULL, 6),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'makeup', 'Susulan Tes Tulis', '2026-11-20', '2026-11-20', '18:30', '21:00', 'TULT', false, 'offered', '["exam"]'::jsonb, 'tes_tulis', NULL, 7),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'cutting', 'Cutting Tes Tulis', '2026-11-25', '2026-11-26', NULL, NULL, NULL, true, 'all', '["cutting"]'::jsonb, 'tes_tulis', NULL, 8),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Tes Tulis', '2026-11-27', '2026-11-27', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'tes_tulis', NULL, 9),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pleno', 'Pleno Wawancara', '2026-11-30', '2026-11-30', NULL, NULL, NULL, true, 'all', '[]'::jsonb, 'wawancara', NULL, 10),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'interview', 'Tes Wawancara', '2026-12-01', '2026-12-03', '18:30', '21:00', 'TULT', false, 'own', '["rubric"]'::jsonb, 'wawancara', NULL, 11),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'makeup', 'Susulan Wawancara', '2026-12-04', '2026-12-04', '18:30', '21:00', 'TULT', false, 'offered', '["rubric"]'::jsonb, 'wawancara', NULL, 12),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'cutting', 'Cutting Wawancara', '2026-12-09', '2026-12-10', NULL, NULL, NULL, true, 'all', '["cutting"]'::jsonb, 'wawancara', NULL, 13),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Wawancara', '2026-12-11', '2026-12-11', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'wawancara', NULL, 14),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'meeting', 'Techmeet Tubes', '2026-12-12', '2026-12-12', NULL, NULL, NULL, false, 'all', '["topics"]'::jsonb, 'tubes', NULL, 15),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'work', 'Pengerjaan Tubes', '2026-12-13', '2026-12-17', '18:30', '22:00', 'Lab IRIS', false, 'all', '["checkin","qr"]'::jsonb, 'tubes', NULL, 16),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'presentation', 'Presentasi Tubes', '2026-12-18', '2026-12-18', NULL, NULL, NULL, false, 'all', '["submission","rubric"]'::jsonb, 'tubes', NULL, 17),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'cutting', 'Cutting Tubes', '2026-12-19', '2026-12-19', NULL, NULL, NULL, true, 'all', '["cutting"]'::jsonb, 'tubes', NULL, 18),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Tubes', '2026-12-20', '2026-12-20', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'tubes', NULL, 19),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'pleno', 'Pleno Mengajar', '2026-12-21', '2026-12-21', NULL, NULL, NULL, true, 'all', '[]'::jsonb, 'mengajar', NULL, 20),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'teaching', 'Tes Mengajar', '2026-12-22', '2026-12-24', '18:30', '21:00', 'TULT', false, 'own', '["rubric"]'::jsonb, 'mengajar', NULL, 21),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'makeup', 'Susulan Mengajar', '2026-12-26', '2026-12-26', '18:30', '21:00', 'TULT', false, 'offered', '["rubric"]'::jsonb, 'mengajar', NULL, 22),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'cutting', 'Cutting Mengajar', '2027-01-04', '2027-01-05', NULL, NULL, NULL, true, 'all', '["cutting"]'::jsonb, 'mengajar', NULL, 23),
((SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Mengajar', '2027-01-06', '2027-01-06', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'mengajar', NULL, 24);
