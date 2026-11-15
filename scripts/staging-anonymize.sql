-- =============================================================================
-- R1 staging: samarkan data pribadi + hapus token/antrean keluar SETELAH salinan
-- backup produksi direstore ke database STAGING. Jangan pernah jalankan di produksi:
-- skrip menolak berjalan bila database tidak bertanda staging (lihat guard).
--
-- Prinsip:
-- - Data pribadi pelanggan/member/kandidat/tamu & data pribadi staf disamarkan secara
--   deterministik (md5) → nilai sama memetakan ke samaran sama di semua tabel, relasi tetap.
-- - Email login staf (tabel "user") TIDAK diubah supaya Owner/staf bisa login staging.
-- - Data bisnis (supplier, alamat outlet/event) tidak diubah.
-- - Semua token, sesi, kunci API, langganan push & antrean pesan/posting keluar dihapus
--   supaya staging tidak bisa mengirim apa pun ke pelanggan/staf atau memakai akses produksi.
-- =============================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF current_database() NOT LIKE '%staging%' THEN
    RAISE EXCEPTION 'DITOLAK: database "%" bukan staging.', current_database();
  END IF;
END
$guard$;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.anon_phone(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v
    ELSE '0899' || substr(regexp_replace(md5(regexp_replace(v, '[^0-9]', '', 'g')), '[^0-9]', '', 'g') || '00000000', 1, 8) END
$$;
CREATE OR REPLACE FUNCTION pg_temp.anon_name(v text, label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v ELSE label || ' ' || upper(substr(md5(lower(btrim(v))), 1, 5)) END
$$;
CREATE OR REPLACE FUNCTION pg_temp.anon_email(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v ELSE 'anon-' || substr(md5(lower(btrim(v))), 1, 12) || '@staging.invalid' END
$$;

-- Pelanggan & member
UPDATE customers SET name = pg_temp.anon_name(name, 'Pelanggan'), phone = pg_temp.anon_phone(phone), address = NULL;
UPDATE member_accounts SET name = pg_temp.anon_name(name, 'Member'), phone = pg_temp.anon_phone(phone), email = pg_temp.anon_email(email);
UPDATE orders SET customer_name = pg_temp.anon_name(customer_name, 'Tamu'), customer_phone = pg_temp.anon_phone(customer_phone),
  delivery_address = CASE WHEN delivery_address IS NULL THEN NULL ELSE 'Alamat disamarkan' END, whatsapp_invoice_url = NULL;
UPDATE kitchen_tickets SET customer_name = pg_temp.anon_name(customer_name, 'Tamu');
UPDATE production_ticket_items SET customer_name = pg_temp.anon_name(customer_name, 'Tamu');
UPDATE production_batch_allocations SET customer_name = pg_temp.anon_name(customer_name, 'Tamu');
UPDATE voucher_redemptions SET customer_phone = pg_temp.anon_phone(customer_phone);
UPDATE crm_campaign_logs SET customer_phone = pg_temp.anon_phone(customer_phone);
UPDATE marketing_broadcast_deliveries SET recipient_name = pg_temp.anon_name(recipient_name, 'Penerima'), recipient_phone = pg_temp.anon_phone(recipient_phone);
UPDATE event_guests SET full_name = pg_temp.anon_name(full_name, 'Tamu'), phone = pg_temp.anon_phone(phone), phone_normalized = pg_temp.anon_phone(phone_normalized);
UPDATE approvals SET requester_phone = pg_temp.anon_phone(requester_phone);

-- Rekrutmen & data pribadi staf (email login staf di tabel "user" tetap)
UPDATE candidates SET full_name = pg_temp.anon_name(full_name, 'Kandidat'), email = pg_temp.anon_email(email),
  whatsapp = pg_temp.anon_phone(whatsapp), instagram_url = NULL, ktp_url = NULL;
UPDATE staff_access_requests SET phone = pg_temp.anon_phone(phone);
UPDATE staff_personal SET nik = NULL, ktp_url = NULL, address = NULL, whatsapp = pg_temp.anon_phone(whatsapp),
  bank_account_name = NULL, bank_account_number = NULL, emergency_name = NULL, emergency_phone = NULL, emergency_relation = NULL;

-- Mitra (Partner Hub, 16 Nov 2026): kontak & rekening mitra disamarkan; nama usaha tetap (data bisnis).
-- Langganan push mitra DIHAPUS: tanpa ini pesanan uji di staging memunculkan notifikasi di HP mitra sungguhan.
UPDATE partners SET pic_name = pg_temp.anon_name(pic_name, 'PIC'), phone = pg_temp.anon_phone(phone),
  address = CASE WHEN address IS NULL THEN NULL ELSE 'Alamat disamarkan' END;
UPDATE partner_accounts SET phone = pg_temp.anon_phone(phone), display_name = pg_temp.anon_name(display_name, 'Akun Mitra');
UPDATE partner_bank_accounts SET account_name = pg_temp.anon_name(account_name, 'Rekening'),
  account_number = '9' || substr(regexp_replace(md5(account_number), '[^0-9]', '', 'g') || '000000000', 1, 9);
UPDATE partner_applications SET owner_name = pg_temp.anon_name(owner_name, 'Pemilik'), whatsapp = pg_temp.anon_phone(whatsapp),
  email = pg_temp.anon_email(email), address = CASE WHEN address IS NULL THEN NULL ELSE 'Alamat disamarkan' END;
DELETE FROM partner_push_subscriptions;

-- Token, sesi, kunci & antrean keluar: staging tidak boleh memakai akses produksi
-- atau mengirim apa pun ke pelanggan/staf.
DELETE FROM session;
DELETE FROM verification;
DELETE FROM member_sessions;
DELETE FROM member_otp_challenges;
DELETE FROM login_attempts;
DELETE FROM rate_limit_counters;
DELETE FROM step_up_challenges;
DELETE FROM oauth_access_token;
DELETE FROM oauth_refresh_token;
DELETE FROM oauth_consent;
DELETE FROM oauth_client_resource;
DELETE FROM oauth_client_assertion;
DELETE FROM oauth_client;
DELETE FROM agent_api_keys;
DELETE FROM push_subscriptions;
DELETE FROM order_push_subscriptions;
DELETE FROM system_keys;
DELETE FROM whatsapp_messaging_queue;
DELETE FROM content_publishing_queue;
DELETE FROM social_publisher_connections;
DELETE FROM google_drive_connections;

-- Audit #14: staging memakai BETTER_AUTH_SECRET sendiri → data yang dikunci secret produksi
-- (rahasia 2FA, kunci JWKS OAuth) tidak terbaca & tidak boleh ikut. Login staging = password saja.
DELETE FROM two_factor;
UPDATE "user" SET two_factor_enabled = false;
DELETE FROM jwks;
DELETE FROM rate_limit;

COMMIT;

SELECT 'ANONYMIZED' AS status,
  (SELECT count(*) FROM customers) AS customers,
  (SELECT count(*) FROM orders) AS orders,
  (SELECT count(*) FROM customers WHERE phone !~ '^0899' AND phone IS NOT NULL AND btrim(phone) <> '') AS customer_phone_left;
