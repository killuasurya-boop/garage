ALTER TABLE "customers" ALTER COLUMN "birthday" TYPE text USING "birthday"::text;
ALTER TABLE "customers" ALTER COLUMN "birthday" TYPE date USING "birthday"::date;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "tag" text NOT NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "customer_tags_customer_id_idx" ON "customer_tags" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "customer_tags_tag_idx" ON "customer_tags" USING btree ("tag");