CREATE TABLE "rec_account" (
	"nim" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"pass_hash" text,
	"klaim_hash" text,
	"versi" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signin_at" timestamp with time zone
);
