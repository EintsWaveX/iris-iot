CREATE TABLE "rec_acceptance" (
	"candidate_id" integer PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"code" text,
	"decision" text DEFAULT 'terima' NOT NULL,
	"promoted_nim" text,
	"promoted_at" timestamp with time zone,
	"promoted_by" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "rec_edition" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rec_edition" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "rec_acceptance" ADD CONSTRAINT "rec_acceptance_candidate_id_rec_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_acceptance" ADD CONSTRAINT "rec_acceptance_edition_id_rec_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."rec_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rec_acceptance_kode" ON "rec_acceptance" USING btree ("edition_id","code") WHERE "rec_acceptance"."code" is not null;
--> statement-breakpoint
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")
SELECT (SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'acceptance', 'Penerimaan Asisten Baru', '2027-01-06', '2027-01-06', NULL, NULL, NULL, true, 'all', '["accept"]'::jsonb, 'penerimaan', NULL, 28
WHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = 2026)
  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = 2026) AND "kind" = 'acceptance' AND "stage" = 'penerimaan');
INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")
SELECT (SELECT "id" FROM "rec_edition" WHERE "year" = 2026), 'announcement', 'Pengumuman Penerimaan', '2027-01-06', '2027-01-06', NULL, NULL, NULL, false, 'all', '["reveal"]'::jsonb, 'penerimaan', NULL, 29
WHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = 2026)
  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = 2026) AND "kind" = 'announcement' AND "stage" = 'penerimaan');
