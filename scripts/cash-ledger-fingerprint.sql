-- Sidik buku kas Garage OS (P6 / T25 uji restore). Jalankan di DB produksi SEBELUM backup
-- dan di DB hasil restore SESUDAHNYA; kedua hasil harus identik. Isi = cashLedgerFingerprint
-- (src/lib/cash-opening.ts) — jangan ubah salah satunya saja (dijaga tes).
--
--   docker compose --env-file .env.production exec -T db \
--     sh -c 'psql -U "$POSTGRES_USER" -d <nama_db> -At' < scripts/cash-ledger-fingerprint.sql
SELECT
  (SELECT count(*)::int FROM cash_ledger_entries) AS entries,
  (SELECT coalesce(max(seq), 0)::int FROM cash_ledger_entries) AS last_seq,
  (SELECT count(*)::int FROM cash_opening_certifications) AS certifications,
  md5(
    coalesce((SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', id, seq, idempotency_key,
      to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), business_date, outlet_id, cash_session_id,
      from_account, to_account, amount, source_type, source_id, source_ref, reverses_id), E'\n' ORDER BY seq) FROM cash_ledger_entries), '')
    || '#' ||
    coalesce((SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s', scope_key, to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      ledger_balance, counted_balance, adjustment, adjustment_entry_id, evidence_ref), E'\n' ORDER BY scope_key) FROM cash_opening_certifications), '')
  ) AS digest;
SELECT account, sum(delta)::int AS balance FROM (
  SELECT to_account AS account, amount AS delta FROM cash_ledger_entries
  UNION ALL SELECT from_account, -amount FROM cash_ledger_entries
) moves GROUP BY account ORDER BY account;
