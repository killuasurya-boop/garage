-- Owner 6 Nov 2026: tutup shift cukup hitung sekali. Setelan hitung ganda (B4) yang tersimpan dimatikan;
-- Owner bisa menyalakannya lagi di Pengaturan → Shift. Tidak ada data transaksi/kas yang diubah.
UPDATE "app_settings" SET "value_json" = 'false'::jsonb, "updated_at" = now() WHERE "key" = 'shiftRequireDoubleCount';
