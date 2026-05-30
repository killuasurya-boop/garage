ALTER TABLE "orders" ADD COLUMN "invoice_pdf_path" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_pdf_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_pdf_generated_at" timestamp with time zone;