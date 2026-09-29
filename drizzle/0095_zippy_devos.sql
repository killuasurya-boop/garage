CREATE TABLE "capital_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_date" date NOT NULL,
	"type" text DEFAULT 'injection' NOT NULL,
	"amount" bigint NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"daily_amount" integer DEFAULT 0 NOT NULL,
	"cost_class" text DEFAULT 'fixed' NOT NULL,
	"treatment" text DEFAULT 'accrue' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_expense_categories" (
	"name" text PRIMARY KEY NOT NULL,
	"group_key" text DEFAULT 'opex' NOT NULL,
	"cost_class" text DEFAULT 'variable' NOT NULL,
	"cost_item_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_payroll_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" text NOT NULL,
	"monthly_salary" integer DEFAULT 0 NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_snapshots" (
	"date" date PRIMARY KEY NOT NULL,
	"gross_sales" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"refund" bigint DEFAULT 0 NOT NULL,
	"void_amount" bigint DEFAULT 0 NOT NULL,
	"void_count" integer DEFAULT 0 NOT NULL,
	"net_sales" bigint DEFAULT 0 NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"cogs" bigint DEFAULT 0 NOT NULL,
	"gross_profit" bigint DEFAULT 0 NOT NULL,
	"gross_margin_bp" integer DEFAULT 0 NOT NULL,
	"payroll" bigint DEFAULT 0 NOT NULL,
	"operating_expense" bigint DEFAULT 0 NOT NULL,
	"operating_profit" bigint DEFAULT 0 NOT NULL,
	"non_operating_expense" bigint DEFAULT 0 NOT NULL,
	"net_profit" bigint DEFAULT 0 NOT NULL,
	"net_margin_bp" integer DEFAULT 0 NOT NULL,
	"cash_in" bigint DEFAULT 0 NOT NULL,
	"cash_out" bigint DEFAULT 0 NOT NULL,
	"closing_cash" bigint,
	"reserve_allocation" bigint DEFAULT 0 NOT NULL,
	"fixed_cost" bigint DEFAULT 0 NOT NULL,
	"variable_cost" bigint DEFAULT 0 NOT NULL,
	"bep_target" bigint,
	"bep_achievement_bp" integer,
	"capital_recovered" bigint,
	"capital_remaining" bigint,
	"hpp_coverage_bp" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'auto' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "capital_transactions_date_idx" ON "capital_transactions" USING btree ("tx_date");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_cost_items_code_uidx" ON "finance_cost_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "financial_snapshots_status_idx" ON "financial_snapshots" USING btree ("status");