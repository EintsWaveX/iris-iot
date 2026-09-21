CREATE TABLE "denyut" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu" integer,
	"memori" integer,
	"disk" integer,
	"suhu" integer,
	"uptime_sec" integer,
	"jam_selaras" boolean DEFAULT false NOT NULL,
	"mode_jaringan" text,
	"layanan" jsonb
);
--> statement-breakpoint
CREATE TABLE "perangkat" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"mac" text NOT NULL,
	"ip" text,
	"vendor" text,
	"jenis" text,
	"nama" text,
	"diadopsi" boolean DEFAULT false NOT NULL,
	"sumber" text NOT NULL,
	"pertama_terlihat" timestamp with time zone DEFAULT now() NOT NULL,
	"terakhir_terlihat" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perangkat_server_mac" UNIQUE("server_id","mac")
);
--> statement-breakpoint
CREATE TABLE "perintah" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"aksi" text NOT NULL,
	"argumen" jsonb,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"diminta_oleh" text NOT NULL,
	"diminta_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_pada" timestamp with time zone,
	"keluaran" text
);
--> statement-breakpoint
CREATE TABLE "server" (
	"id" serial PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kode" text NOT NULL,
	"alamat_lan" text,
	"agen_kunci_hash" text,
	"daftar_token_hash" text,
	"daftar_token_exp" timestamp with time zone,
	"terdaftar_pada" timestamp with time zone,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
ALTER TABLE "denyut" ADD CONSTRAINT "denyut_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perangkat" ADD CONSTRAINT "perangkat_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perintah" ADD CONSTRAINT "perintah_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "denyut_server_pada_idx" ON "denyut" USING btree ("server_id","pada");--> statement-breakpoint
CREATE INDEX "perintah_server_status_idx" ON "perintah" USING btree ("server_id","status");