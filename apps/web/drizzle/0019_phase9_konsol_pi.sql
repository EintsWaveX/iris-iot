CREATE TABLE "konsol_keberatan" (
	"id" serial PRIMARY KEY NOT NULL,
	"konsol_id" integer NOT NULL,
	"nim" text NOT NULL,
	"jenis" text NOT NULL,
	"teks" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "konsol_keberatan_jenis" CHECK ("konsol_keberatan"."jenis" in ('oke', 'tanya', 'tolak'))
);
--> statement-breakpoint
CREATE TABLE "konsol_pi" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"nim" text NOT NULL,
	"target" text NOT NULL,
	"alasan" text NOT NULL,
	"status" text DEFAULT 'diminta' NOT NULL,
	"kanal" text NOT NULL,
	"disetujui_oleh" text,
	"tanpa_persetujuan" boolean DEFAULT false NOT NULL,
	"override_sesi_oleh" text,
	"override_alasan" text,
	"diminta_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"disetujui_pada" timestamp with time zone,
	"mulai" timestamp with time zone,
	"selesai" timestamp with time zone,
	"alasan_selesai" text,
	"diputus_oleh" text,
	"transkrip_bytes" integer,
	"transkrip" text,
	CONSTRAINT "konsol_pi_kanal_unique" UNIQUE("kanal"),
	CONSTRAINT "konsol_pi_target" CHECK ("konsol_pi"."target" in ('terminal', ':0', ':1')),
	CONSTRAINT "konsol_pi_status" CHECK ("konsol_pi"."status" in ('diminta', 'disetujui', 'ditolak', 'aktif', 'selesai', 'kedaluwarsa', 'diputus'))
);
--> statement-breakpoint
CREATE TABLE "konsol_tiket_nonce" (
	"nonce" text PRIMARY KEY NOT NULL,
	"konsol_id" integer NOT NULL,
	"peran" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "konsol_keberatan" ADD CONSTRAINT "konsol_keberatan_konsol_id_konsol_pi_id_fk" FOREIGN KEY ("konsol_id") REFERENCES "public"."konsol_pi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "konsol_pi" ADD CONSTRAINT "konsol_pi_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "konsol_tiket_nonce" ADD CONSTRAINT "konsol_tiket_nonce_konsol_id_konsol_pi_id_fk" FOREIGN KEY ("konsol_id") REFERENCES "public"."konsol_pi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "konsol_keberatan_konsol_idx" ON "konsol_keberatan" USING btree ("konsol_id");--> statement-breakpoint
CREATE INDEX "konsol_pi_server_status_idx" ON "konsol_pi" USING btree ("server_id","status");