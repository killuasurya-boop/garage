# CHECKLIST WAREHOUSE CLOSING

Gunakan setiap malam setelah operasional selesai.

## Penutupan transaksi stok

- [ ] Pastikan semua order POS hari ini sudah **paid/closed** (stok otomatis terpotong jika auto-consume ON)
- [ ] Cek **Reports** (`/warehouse/reports`) — movement `out` dari penjualan masuk ledger
- [ ] Catat waste/rusak di **Adjustment** dengan alasan jelas

## Opname & akurasi

- [ ] Item critical (kopi, susu, protein utama) — hitung fisik vs sistem
- [ ] Jika selisih > toleransi: buat sesi **Opname** (`/warehouse/opname`)
- [ ] Manager **finalize** opname sebelum tutup shift gudang

## Resep & HPP

- [ ] Review resep dengan **Insights** score rendah di `/warehouse/recipe`
- [ ] Food cost merah (>38%) — flag ke manager/finance
- [ ] Sub-recipe production: pastikan batch hari ini tercatat di `/warehouse/production`

## Reorder & eskalasi

- [ ] Review low stock untuk PO/internal order besok
- [ ] Export backup resep JSON (opsional mingguan) dari Recipe › Export
- [ ] Eskalasi ke owner jika: coverage resep turun, margin negatif, atau variance opname besar

## Tutup shift

- [ ] Logout device gudang
- [ ] Screenshot/dashboard KPI untuk arsip manager (opsional)
- [ ] Catat insiden operasional di audit/checklist jika ada
