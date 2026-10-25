-- Investigasi selisih shift CS-OUTLET-A-2916280320 (25 Okt 2026, 15.18–23.05 WIB)
-- READ ONLY: tidak mengubah data apa pun.
-- Jalankan di VPS (folder app):
--   docker compose --env-file .env.production exec -T db \
--     sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < output/cek-shift-CS-OUTLET-A-2916280320.sql > hasil-cek-shift.txt
BEGIN TRANSACTION READ ONLY;
\pset pager off

\echo '=== 1. Sesi kasir ==='
SELECT id, code, status, opening_cash, expected_cash, actual_cash, discrepancy, discrepancy_status,
       qris_recorded, qris_counted, qris_discrepancy, opened_by, closed_by
FROM cash_sessions WHERE code = 'CS-OUTLET-A-2916280320';

\echo '=== 2. Buku kas laci — semua baris (cari yang 95.000) ==='
SELECT l.seq, to_char(l.occurred_at AT TIME ZONE 'Asia/Jakarta','HH24:MI:SS') AS jam,
       l.source_type, l.source_ref, l.from_account, l.to_account,
       CASE WHEN l.to_account = 'drawer' THEN l.amount ELSE -l.amount END AS efek_laci,
       l.reverses_id, l.actor_user_id, l.approver_user_id, l.note, l.metadata
FROM cash_ledger_entries l
JOIN cash_sessions s ON s.id = l.cash_session_id
WHERE s.code = 'CS-OUTLET-A-2916280320'
ORDER BY l.seq;

\echo '=== 3. Ringkasan buku kas per jenis ==='
SELECT l.source_type, count(*) AS baris,
       sum(CASE WHEN l.to_account = 'drawer' THEN l.amount ELSE -l.amount END) AS efek_laci
FROM cash_ledger_entries l
JOIN cash_sessions s ON s.id = l.cash_session_id
WHERE s.code = 'CS-OUTLET-A-2916280320'
GROUP BY l.source_type ORDER BY l.source_type;

\echo '=== 4. Pembayaran per order (method, status, split) ==='
SELECT o.order_no, to_char(o.created_at AT TIME ZONE 'Asia/Jakarta','HH24:MI') AS jam,
       o.table_label, o.channel, o.total, p.method, p.amount, p.status,
       count(*) OVER (PARTITION BY o.id) AS jml_payment, p.metadata
FROM payments p
JOIN orders o ON o.id = p.order_id
JOIN cash_sessions s ON s.id = p.cash_session_id
WHERE s.code = 'CS-OUTLET-A-2916280320'
ORDER BY o.created_at, p.created_at;

\echo '=== 5. Order 69.000 (POS-2930654167) dan order sesudah 22.32 ==='
SELECT o.order_no, o.total, o.cashier, o.customer_name, p.method, p.amount, p.status, p.metadata
FROM orders o LEFT JOIN payments p ON p.order_id = o.id
WHERE o.order_no IN ('POS-2930654167','POS-2943166445','POS-2943695756','POS-2944069493');

\echo '=== 6. Pengeluaran Finance 25 Okt (cari 95.000 & sumber kas laci) ==='
SELECT id, category, description, amount, payment_method, cash_source, status, source_doc,
       receipt_url, notes, created_by, approved_by,
       to_char(created_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI') AS dibuat
FROM expenses
WHERE expense_date::date = DATE '2026-10-25' OR (created_at AT TIME ZONE 'Asia/Jakarta')::date = DATE '2026-10-25'
ORDER BY created_at;

\echo '=== 7. Log audit selama shift (ubah metode, revert, void, kas, expense) ==='
SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta','HH24:MI:SS') AS jam, actor, action, object, status, metadata
FROM audit_logs
WHERE created_at >= TIMESTAMPTZ '2026-10-25 15:00:00+07'
  AND created_at <  TIMESTAMPTZ '2026-10-26 01:00:00+07'
  AND (action ILIKE ANY (ARRAY['%method%','%metode%','%revert%','%void%','%refund%','%cash%','%kas%',
                               '%expense%','%biaya%','%pengeluaran%','%payment%','%bayar%','%delete%','%hapus%'])
       OR object ILIKE ANY (ARRAY['%CS-OUTLET-A-2916280320%','%KAS-261025%']))
ORDER BY created_at;

ROLLBACK;
