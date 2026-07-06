# CHECKLIST WAREHOUSE OPENING

Gunakan setiap pagi sebelum operasional gudang/dapur/bar dimulai.

## Akses & perangkat

- [ ] Login akun gudang / manager (`gudang@` atau `manager@`)
- [ ] Buka `/warehouse` — dashboard load tanpa error
- [ ] Tablet/HP gudang terhubung Wi‑Fi stabil
- [ ] Scanner barcode (jika dipakai) sudah diuji di `/warehouse/scan`

## Stok & alert

- [ ] Cek KPI dashboard: **low stock**, **out of stock**, nilai inventory
- [ ] Review banner **Smart Reorder** — buat internal order jika perlu
- [ ] Cek cold chain (`/warehouse/cold-chain`) jika ada bahan perishable

## Resep & POS

- [ ] Cek **Recipe coverage** di `/warehouse/recipe` — target ≥ 95%
- [ ] Jika ada menu baru kemarin: **Tarik dari Produk OS** atau sync penuh di Settings
- [ ] Pastikan **wmsAutoConsume = ON** di `/warehouse/settings` › Integrasi POS
- [ ] Indikator POS menampilkan **Gudang Auto** (bukan Manual)

## Operasional pagi

- [ ] Terima barang (Receiving) jika ada PO/datang supplier
- [ ] Transfer bahan ke dapur/bar sesuai kebutuhan shift
- [ ] Jalankan checklist harian (`/warehouse/checklist`) jika aktif
- [ ] Briefing staf: item low stock & bahan substitusi

## Eskalasi

- Resep coverage < 90% → hubungi manager + sync OS
- Auto-consume mati → jangan buka POS tanpa konfirmasi manager
- Selisih stok besar → catat di adjustment, jangan lanpa opname
