CREATE TABLE "telemetri_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sesi_id" integer,
	"modul" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"seq" integer NOT NULL,
	"tx" text,
	"rx" text,
	"delay_ms" integer,
	"rssi" integer,
	"snr" integer,
	"dicatat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetri_terkini" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"modul" integer NOT NULL,
	"kelompok_nomor" integer NOT NULL,
	"seq" integer NOT NULL,
	"tx" text,
	"rx" text,
	"delay_ms" integer,
	"rssi" integer,
	"snr" integer,
	"diperbarui_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telemetri_terkini_server_modul_kelompok" UNIQUE("server_id","modul","kelompok_nomor")
);
--> statement-breakpoint
ALTER TABLE "telemetri_log" ADD CONSTRAINT "telemetri_log_sesi_id_sesi_id_fk" FOREIGN KEY ("sesi_id") REFERENCES "public"."sesi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetri_terkini" ADD CONSTRAINT "telemetri_terkini_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetri_log_sesi_modul_kelompok_idx" ON "telemetri_log" USING btree ("sesi_id","modul","kelompok_nomor");