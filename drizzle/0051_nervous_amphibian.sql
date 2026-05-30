CREATE TABLE "operation_glossary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"definition" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"radius" integer DEFAULT 100 NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operation_locations" ADD CONSTRAINT "operation_locations_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operation_glossary_term_idx" ON "operation_glossary" USING btree ("term");--> statement-breakpoint
CREATE INDEX "operation_glossary_category_idx" ON "operation_glossary" USING btree ("category");--> statement-breakpoint
CREATE INDEX "operation_locations_outlet_idx" ON "operation_locations" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "operation_locations_type_idx" ON "operation_locations" USING btree ("type");