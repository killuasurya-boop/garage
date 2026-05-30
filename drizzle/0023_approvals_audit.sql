-- Approvals: tambah field untuk audit trail keputusan + WA notify requester.
-- Idempotent dengan IF NOT EXISTS guard supaya aman dijalankan ulang.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'requester_phone'
    ) THEN
        ALTER TABLE "approvals" ADD COLUMN "requester_phone" text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'decided_by_name'
    ) THEN
        ALTER TABLE "approvals" ADD COLUMN "decided_by_name" text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'reason_decided'
    ) THEN
        ALTER TABLE "approvals" ADD COLUMN "reason_decided" text;
    END IF;
END $$;
