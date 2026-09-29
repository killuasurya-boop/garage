CREATE TABLE "finance_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"params" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "finance_scenarios_created_idx" ON "finance_scenarios" USING btree ("created_at");