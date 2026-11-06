ALTER TABLE "company_document_versions" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "company_documents" ADD COLUMN "approved_version" integer;--> statement-breakpoint
ALTER TABLE "company_document_versions" ADD CONSTRAINT "company_document_versions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Document Approval (Batch 7): versi yang sudah ada sebelum fitur ini tetap berlaku (legacy), tidak dihapus.
UPDATE "company_document_versions" SET "review_status" = 'legacy' WHERE "review_status" = 'pending';--> statement-breakpoint
UPDATE "company_documents" SET "approved_version" = "current_version" WHERE "approved_version" IS NULL;
