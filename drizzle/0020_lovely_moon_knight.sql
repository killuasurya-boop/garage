-- Migration ini dipotong jadi minimal: cuma menambah kolom staff_note untuk
-- fitur CRM staff note. Auto-generate sebelumnya berisi accumulated diff
-- dari banyak schema changes lain (cash_movements, expenses, suppliers, dll)
-- yang sebenarnya sudah ada di DB production — kalau dijalankan akan crash
-- dengan "table already exists". Karena snapshot 0020 sudah merefleksikan
-- state akhir yang benar, kita hanya butuh ALTER yang aman untuk fitur baru.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'staff_note'
    ) THEN
        ALTER TABLE "customers" ADD COLUMN "staff_note" text;
    END IF;
END $$;
