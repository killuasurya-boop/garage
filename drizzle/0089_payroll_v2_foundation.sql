CREATE TABLE "fee_pool_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"pool_amount" integer DEFAULT 0 NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"fee_per_product" integer DEFAULT 200 NOT NULL,
	"split_mode" text DEFAULT 'proportional_hours' NOT NULL,
	"fallback_mode" text DEFAULT 'hangus' NOT NULL,
	"total_staff_valid" integer DEFAULT 0 NOT NULL,
	"total_minutes_valid" integer DEFAULT 0 NOT NULL,
	"finalized_at" timestamp with time zone,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_pool_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"staff_user_id" text NOT NULL,
	"minutes_worked" integer NOT NULL,
	"share_pct" real NOT NULL,
	"amount" integer NOT NULL,
	"bonus_target" integer DEFAULT 0 NOT NULL,
	"bonus_zero_komplain" integer DEFAULT 0 NOT NULL,
	"earning_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_attendance_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"date" date NOT NULL,
	"checkin_at" timestamp with time zone,
	"checkin_lat" real,
	"checkin_lng" real,
	"checkin_selfie_url" text,
	"checkin_device" text,
	"checkout_at" timestamp with time zone,
	"checkout_lat" real,
	"checkout_lng" real,
	"checkout_selfie_url" text,
	"checkout_device" text,
	"method" text DEFAULT 'pin_selfie_gps' NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_daily_wages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"date" date NOT NULL,
	"base_wage" integer DEFAULT 0 NOT NULL,
	"late_multiplier_pct" integer DEFAULT 100 NOT NULL,
	"overtime_amount" integer DEFAULT 0 NOT NULL,
	"bonus_amount" integer DEFAULT 0 NOT NULL,
	"deduction_amount" integer DEFAULT 0 NOT NULL,
	"total_credited" integer DEFAULT 0 NOT NULL,
	"balance_after" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'cron_finalize' NOT NULL,
	"note" text,
	"payout_id" uuid,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"wallet_type" text NOT NULL,
	"amount_gaji" integer DEFAULT 0 NOT NULL,
	"amount_fee" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"expense_id_gaji" uuid,
	"expense_id_fee" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_wage_config" (
	"staff_user_id" text PRIMARY KEY NOT NULL,
	"daily_wage" integer DEFAULT 0 NOT NULL,
	"overtime_hourly" integer DEFAULT 0 NOT NULL,
	"monthly_deduction" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_pool_splits" ADD CONSTRAINT "fee_pool_splits_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_v2" ADD CONSTRAINT "staff_attendance_v2_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_daily_wages" ADD CONSTRAINT "staff_daily_wages_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payout_requests" ADD CONSTRAINT "staff_payout_requests_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_payout_requests" ADD CONSTRAINT "staff_payout_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_wage_config" ADD CONSTRAINT "staff_wage_config_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_wage_config" ADD CONSTRAINT "staff_wage_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_pool_splits_date_staff_uidx" ON "fee_pool_splits" USING btree ("date","staff_user_id");--> statement-breakpoint
CREATE INDEX "fee_pool_splits_date_idx" ON "fee_pool_splits" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_attendance_v2_staff_date_uidx" ON "staff_attendance_v2" USING btree ("staff_user_id","date");--> statement-breakpoint
CREATE INDEX "staff_attendance_v2_date_idx" ON "staff_attendance_v2" USING btree ("date");--> statement-breakpoint
CREATE INDEX "staff_attendance_v2_status_idx" ON "staff_attendance_v2" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_daily_wages_staff_date_uidx" ON "staff_daily_wages" USING btree ("staff_user_id","date");--> statement-breakpoint
CREATE INDEX "staff_daily_wages_payout_idx" ON "staff_daily_wages" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "staff_daily_wages_date_idx" ON "staff_daily_wages" USING btree ("date");--> statement-breakpoint
CREATE INDEX "staff_payout_requests_staff_idx" ON "staff_payout_requests" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_payout_requests_status_idx" ON "staff_payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_payout_requests_created_idx" ON "staff_payout_requests" USING btree ("created_at");