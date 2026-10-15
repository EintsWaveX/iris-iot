CREATE TABLE "tp_jejak" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"jenis" text NOT NULL,
	"sumber" text NOT NULL,
	"lms_kursus" integer,
	"berkas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dikirim_pada" timestamp with time zone,
	"dicatat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tp_jejak_modul_idx" ON "tp_jejak" USING btree ("semester","modul","dicatat_pada");--> statement-breakpoint
-- Every file already in counts as its first: one row each, names and sizes only.
INSERT INTO "tp_jejak" ("semester", "modul", "nim", "jenis", "sumber", "lms_kursus", "berkas", "dikirim_pada", "dicatat_pada")
SELECT k."semester", k."modul", k."nim",
       CASE WHEN k."sumber" = 'iris' THEN 'unggah' ELSE 'baru' END,
       k."sumber", k."lms_kursus",
       COALESCE((SELECT jsonb_agg(jsonb_build_object('nama', b->>'nama', 'ukuran', COALESCE((b->>'ukuran')::int, 0)))
                 FROM jsonb_array_elements(k."berkas") b), '[]'::jsonb),
       k."dikirim_pada",
       COALESCE(k."diambil_pada", k."dikirim_pada", now())
FROM "tp_kiriman" k
WHERE jsonb_array_length(k."berkas") > 0;
