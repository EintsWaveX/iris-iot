CREATE TABLE "jurnal_tangkapan" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer,
	"kelompok_id" integer NOT NULL,
	"modul" integer NOT NULL,
	"jenis" text NOT NULL,
	"baris" jsonb NOT NULL,
	"nim" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurnal_tangkapan_jenis" CHECK ("jurnal_tangkapan"."jenis" in ('paket', 'jarak')),
	CONSTRAINT "jurnal_tangkapan_modul" CHECK ("jurnal_tangkapan"."modul" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "serial_cermin" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"sumber" text NOT NULL,
	"teks" text NOT NULL,
	"t" integer NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jurnal_tangkapan" ADD CONSTRAINT "jurnal_tangkapan_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurnal_tangkapan" ADD CONSTRAINT "jurnal_tangkapan_kelompok_id_kelompok_id_fk" FOREIGN KEY ("kelompok_id") REFERENCES "public"."kelompok"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_cermin" ADD CONSTRAINT "serial_cermin_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jurnal_tangkapan_kelompok_idx" ON "jurnal_tangkapan" USING btree ("kelompok_id","modul");--> statement-breakpoint
CREATE INDEX "jurnal_tangkapan_sesi_idx" ON "jurnal_tangkapan" USING btree ("sesi_id");--> statement-breakpoint
CREATE INDEX "serial_cermin_sesi_kelompok_idx" ON "serial_cermin" USING btree ("sesi_id","kelompok_nomor","id");