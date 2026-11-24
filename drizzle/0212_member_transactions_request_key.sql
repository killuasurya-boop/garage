ALTER TABLE "member_transactions" ADD COLUMN "request_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "member_transactions_request_key_idx" ON "member_transactions" USING btree ("request_key");