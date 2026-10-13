CREATE TABLE "seelabs_akses" (
	"nim" text PRIMARY KEY NOT NULL,
	"segel" text NOT NULL,
	"sidik_kunci" text NOT NULL,
	"status" text DEFAULT 'menunggu_uji' NOT NULL,
	"bawaan" boolean DEFAULT true NOT NULL,
	"galat" text,
	"jaga_sidik" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diuji_pada" timestamp with time zone,
	"berhasil_pada" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seelabs_tugas" (
	"id" serial PRIMARY KEY NOT NULL,
	"jenis" text NOT NULL,
	"sesi_id" integer,
	"kelompok_nomor" integer,
	"klp" text,
	"akun_nim" text NOT NULL,
	"isi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sidik" text,
	"token" text,
	"status" text DEFAULT 'antre' NOT NULL,
	"percobaan" integer DEFAULT 0 NOT NULL,
	"galat_kode" text,
	"galat_rinci" text,
	"bukti" jsonb,
	"oleh" text NOT NULL,
	"server_id" integer,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"jalan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diambil" timestamp with time zone,
	"selesai" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "seelabs_ekspor" ADD COLUMN "cara" text;--> statement-breakpoint
ALTER TABLE "seelabs_akses" ADD CONSTRAINT "seelabs_akses_nim_asisten_nim_fk" FOREIGN KEY ("nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seelabs_tugas" ADD CONSTRAINT "seelabs_tugas_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seelabs_tugas" ADD CONSTRAINT "seelabs_tugas_akun_nim_asisten_nim_fk" FOREIGN KEY ("akun_nim") REFERENCES "public"."asisten"("nim") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seelabs_tugas_status_idx" ON "seelabs_tugas" USING btree ("status","jalan_pada");--> statement-breakpoint
CREATE INDEX "seelabs_tugas_sesi_idx" ON "seelabs_tugas" USING btree ("sesi_id","kelompok_nomor");--> statement-breakpoint
CREATE UNIQUE INDEX "seelabs_tugas_satu_antre" ON "seelabs_tugas" USING btree ("jenis","akun_nim",coalesce("sesi_id", 0),coalesce("kelompok_nomor", 0),coalesce("klp", '')) WHERE "seelabs_tugas"."status" = 'antre';