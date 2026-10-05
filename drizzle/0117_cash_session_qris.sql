ALTER TABLE "cash_sessions" ADD COLUMN "qris_recorded" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "qris_counted" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "qris_discrepancy" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "qris_checked_by" text;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "qris_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_qris_checked_by_user_id_fk" FOREIGN KEY ("qris_checked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;