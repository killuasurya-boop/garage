DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'member_transactions' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE "member_transactions" ADD COLUMN "expires_at" timestamp with time zone;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vouchers' AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE "vouchers" ADD COLUMN "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'vouchers' AND indexname = 'vouchers_customer_id_idx'
    ) THEN
        CREATE INDEX "vouchers_customer_id_idx" ON "vouchers" ("customer_id");
    END IF;

    CREATE TABLE IF NOT EXISTS "crm_campaign_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
        "customer_phone" text,
        "segment_key" text NOT NULL,
        "template_key" text NOT NULL,
        "channel" text DEFAULT 'whatsapp' NOT NULL,
        "message_preview" text DEFAULT '' NOT NULL,
        "status" text DEFAULT 'opened' NOT NULL,
        "sent_by" text REFERENCES "user"("id") ON DELETE set null,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'crm_campaign_logs' AND indexname = 'crm_campaign_logs_customer_id_idx'
    ) THEN
        CREATE INDEX "crm_campaign_logs_customer_id_idx" ON "crm_campaign_logs" ("customer_id");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'crm_campaign_logs' AND indexname = 'crm_campaign_logs_segment_idx'
    ) THEN
        CREATE INDEX "crm_campaign_logs_segment_idx" ON "crm_campaign_logs" ("segment_key");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'crm_campaign_logs' AND indexname = 'crm_campaign_logs_created_at_idx'
    ) THEN
        CREATE INDEX "crm_campaign_logs_created_at_idx" ON "crm_campaign_logs" ("created_at");
    END IF;
END $$;
