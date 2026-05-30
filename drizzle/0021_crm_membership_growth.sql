DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'birthday'
    ) THEN
        ALTER TABLE "customers" ADD COLUMN "birthday" text;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'referral_code'
    ) THEN
        ALTER TABLE "customers" ADD COLUMN "referral_code" text;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'referred_by_code'
    ) THEN
        ALTER TABLE "customers" ADD COLUMN "referred_by_code" text;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'customers' AND indexname = 'customers_referral_code_idx'
    ) THEN
        CREATE UNIQUE INDEX "customers_referral_code_idx" ON "customers" ("referral_code");
    END IF;
END $$;
