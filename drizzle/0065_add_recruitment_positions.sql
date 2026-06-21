CREATE TABLE "recruitment_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"location" text DEFAULT 'Tebing Tinggi' NOT NULL,
	"type" text DEFAULT 'Full-time' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_positions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recruitment_positions_slug_idx" ON "recruitment_positions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recruitment_positions_is_open_idx" ON "recruitment_positions" USING btree ("is_open");--> statement-breakpoint
CREATE INDEX "recruitment_positions_sort_idx" ON "recruitment_positions" USING btree ("sort_order");