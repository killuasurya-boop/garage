ALTER TABLE "approvals" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "decided_via" text;