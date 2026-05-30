CREATE TABLE "member_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "member_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"source" text NOT NULL,
	"amount" integer NOT NULL,
	"points_earned" integer NOT NULL,
	"level_before" text NOT NULL,
	"level_after" text NOT NULL,
	"upgrade_notification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"points_used" integer NOT NULL,
	"discount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"terminal_code" text NOT NULL,
	"location" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_terminals_terminal_code_unique" UNIQUE("terminal_code"),
	CONSTRAINT "pos_terminals_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
ALTER TABLE "member_accounts" ADD CONSTRAINT "member_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_account_id_member_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."member_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_transactions" ADD CONSTRAINT "member_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_accounts_customer_id_idx" ON "member_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_accounts_phone_idx" ON "member_accounts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "member_accounts_email_idx" ON "member_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_accounts_status_idx" ON "member_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_sessions_account_id_idx" ON "member_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_sessions_refresh_token_hash_idx" ON "member_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "member_transactions_customer_id_idx" ON "member_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "member_transactions_source_idx" ON "member_transactions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "member_transactions_created_at_idx" ON "member_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "point_redemptions_customer_id_idx" ON "point_redemptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "point_redemptions_created_at_idx" ON "point_redemptions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_terminals_terminal_code_idx" ON "pos_terminals" USING btree ("terminal_code");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_terminals_api_key_hash_idx" ON "pos_terminals" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "pos_terminals_status_idx" ON "pos_terminals" USING btree ("status");