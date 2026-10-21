CREATE TABLE "tp_perpanjang" (
	"id" serial PRIMARY KEY NOT NULL,
	"semester" text NOT NULL,
	"modul" integer NOT NULL,
	"nim" text NOT NULL,
	"sampai" timestamp with time zone NOT NULL,
	"alasan" text,
	"oleh" text NOT NULL,
	"pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tp_perpanjang_unik" UNIQUE("semester","modul","nim")
);
--> statement-breakpoint
ALTER TABLE "tp_unggah" ADD COLUMN "kunci" text;--> statement-breakpoint
ALTER TABLE "tp_unggah" ADD COLUMN "mime" text DEFAULT 'application/pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "tp_unggah" ADD COLUMN "halaman" integer;--> statement-breakpoint
ALTER TABLE "tp_unggah" ADD COLUMN "asal" text DEFAULT 'iris' NOT NULL;