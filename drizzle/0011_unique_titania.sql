CREATE TABLE "site_assets" (
	"slot" text PRIMARY KEY NOT NULL,
	"public_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"version" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_assets" ADD CONSTRAINT "site_assets_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "site_assets" (
	"slot",
	"public_url",
	"width",
	"height",
	"alt",
	"size_bytes",
	"mime_type",
	"version",
	"updated_by"
) VALUES (
	'landing_hero',
	'/garage-uploads/landing/hero-20260518142038.webp',
	1254,
	1254,
	'Lineup gelas Garage Coffee & Motor',
	46348,
	'image/webp',
	'20260518142038',
	NULL
) ON CONFLICT ("slot") DO NOTHING;
