ALTER TABLE "partner_product_links" ADD COLUMN "submission_status" text;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD COLUMN "submission_note" text;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_product_links" ADD CONSTRAINT "partner_product_links_submission_status_check" CHECK ("partner_product_links"."submission_status" is null or "partner_product_links"."submission_status" in ('pending','revision','approved','withdrawn'));