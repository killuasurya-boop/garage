CREATE TABLE "custom_segment_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_segment_customers" ADD CONSTRAINT "custom_segment_customers_segment_id_custom_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."custom_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_segment_customers" ADD CONSTRAINT "custom_segment_customers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_segments" ADD CONSTRAINT "custom_segments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_segment_customers_segment_idx" ON "custom_segment_customers" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "custom_segment_customers_customer_idx" ON "custom_segment_customers" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_segment_customers_segment_customer_idx" ON "custom_segment_customers" USING btree ("segment_id","customer_id");--> statement-breakpoint
CREATE INDEX "custom_segments_name_idx" ON "custom_segments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "custom_segments_created_by_idx" ON "custom_segments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "custom_segments_created_at_idx" ON "custom_segments" USING btree ("created_at");