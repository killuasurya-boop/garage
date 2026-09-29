DROP INDEX IF EXISTS "staff_daily_wages_staff_date_uidx";--> statement-breakpoint
ALTER TABLE "staff_wage_config" ADD COLUMN "absen_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_daily_wages_staff_date_source_uidx" ON "staff_daily_wages" USING btree ("staff_user_id","date","source");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_wage_config_absen_code_uidx" ON "staff_wage_config" USING btree ("absen_code");