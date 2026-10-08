CREATE TABLE "nilai_kirim" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"dikirim_oleh" text NOT NULL,
	"dikirim_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nilai_kirim_sesi_kelompok" UNIQUE("sesi_id","kelompok_nomor")
);
--> statement-breakpoint
ALTER TABLE "nilai_kirim" ADD CONSTRAINT "nilai_kirim_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Kirim Nilai starts gating pay and what Praktikan see (2026-10-09). Every
-- group that is already paid, or already has scores in a finished session,
-- counts as sent, so no unit disappears and no student loses a score.
INSERT INTO "nilai_kirim" ("sesi_id", "kelompok_nomor", "dikirim_oleh", "dikirim_pada")
SELECT DISTINCT ON (u."sesi_id", u."kelompok_nomor") u."sesi_id", u."kelompok_nomor", u."nim_penilai", COALESCE(s."selesai_pada", now())
FROM "unit_bayar" u JOIN "sesi" s ON s."id" = u."sesi_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "nilai_kirim" ("sesi_id", "kelompok_nomor", "dikirim_oleh", "dikirim_pada")
SELECT n."sesi_id", sa."kelompok_nomor", MIN(n."diubah_oleh"), MAX(n."diubah_pada")
FROM "nilai" n
JOIN "sesi" s ON s."id" = n."sesi_id" AND s."status" = 'selesai'
JOIN "sesi_anggota" sa ON sa."sesi_id" = n."sesi_id" AND sa."nim" = n."nim"
GROUP BY n."sesi_id", sa."kelompok_nomor"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "nilai_kirim" ("sesi_id", "kelompok_nomor", "dikirim_oleh", "dikirim_pada")
SELECT n."sesi_id", k."nomor", MIN(n."diubah_oleh"), MAX(n."diubah_pada")
FROM "nilai" n
JOIN "sesi" s ON s."id" = n."sesi_id" AND s."status" = 'selesai'
JOIN "anggota" a ON a."nim" = n."nim"
JOIN "kelompok" k ON k."id" = a."kelompok_id"
WHERE NOT EXISTS (SELECT 1 FROM "sesi_anggota" x WHERE x."sesi_id" = n."sesi_id")
GROUP BY n."sesi_id", k."nomor"
ON CONFLICT DO NOTHING;
