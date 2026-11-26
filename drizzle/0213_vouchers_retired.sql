-- Keputusan Owner 25 Nov 2026: semua voucher dimatikan (voucher daftar WELCOME-, hadiah CRM GIFT-, promo Marketing,
-- kode seed). Voucher yang masih aktif dijeda agar tidak tampil aktif di panel Marketing/CRM. Server juga menolak semua
-- voucher lewat `validateVoucher` (src/lib/voucher-policy.ts), jadi langkah ini hanya merapikan data.
-- Tidak ada baris yang dihapus: riwayat voucher_redemptions & tautan marketing_campaigns tetap utuh.
UPDATE "vouchers" SET "status" = 'paused', "updated_at" = now() WHERE "status" = 'active';
