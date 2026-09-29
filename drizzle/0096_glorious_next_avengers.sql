CREATE TABLE "finance_daily_closings" (
	"date" date PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'closed' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"figures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"closed_by" text,
	"closed_by_name" text,
	"closed_at" timestamp with time zone,
	"reopened_by" text,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_monthly_closings" (
	"month" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'closed' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"closed_by" text,
	"closed_by_name" text,
	"closed_at" timestamp with time zone,
	"reopened_by" text,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
