# Referensi bahan DATA GUDANG — 23 Oktober 2026

Sumber owner memiliki 76 baris: 36 Bar dan 40 Dapur. Kolom SKU, Nama, Kategori, Satuan, Min Stok, HPP, Barcode dan Stok dipertahankan sebagai referensi; seluruh Stok kosong berarti belum diketahui. File sumber tersedia dalam paket aplikasi sebagai `garage-material-reference-source.ts` dengan SHA-256, sehingga Owner tidak perlu mengunggah ulang file yang telah diberikan.

## Alur

- `POST /api/wms/material-reference`, multipart: `source=garage-2026-10-23` atau `file=<CSV>`, `mode=preview|apply`.
- Preview tidak menulis database. Apply khusus Owner menyimpan teks CSV asli, hash, baris, konfirmasi dan audit ke `master_imports`; alias kanonik terpisah di `master_crosswalk.kind=material_reference`. Tidak membutuhkan migrasi baru.
- GET khusus Owner/Manajer menampilkan referensi terakhir dan cakupan resep terkini, melalui `menu_recipes.inventory_sku` serta ID BOM WMS yang sudah terhubung. Tidak dibuat produk atau resep POS baru.
- Apply identik memakai request hash dan lock transaksi yang sama dengan master import W2. Pengulangan tidak mengubah ulang metadata atau membuat bahan ganda.

## Aturan data

- `BAR-9NN` dipetakan ke `BAR-0NN` Garage. Identitas lama/kanonik yang sama-sama ada menjadi konflik, bukan alasan membuat duplikat.
- Biaya, nama, satuan, kategori, resep, harga jual dan stok bahan yang sudah ada tidak ditimpa. Konflik Coklat Rp145.000 vs Rp220.000 tetap dilaporkan; Fresh Milk Rp276.500 tetap memakai isi kemasan Garage, bukan angka Min Stok CSV 1000.
- Bila identitas, area dan satuan setara serta bahan aktif dan sudah terhubung WMS, apply boleh menambahkan alias pencarian serta memperbarui minimum. Nilai minimum kg/gr atau liter/ml dikonversi secara eksplisit. Bks/gr, kotak/ml dan massa/volume tidak ditebak. Pilihan `applyMetadata=false` menyimpan referensi tanpa mengubah metadata operasional.
- Minimum tidak pernah dipakai sebagai isi kemasan. HPP CSV adalah referensi dengan basis ambigu, bukan langsung HPP/satuan.
- Bahan baru tetap `needs_validation` sampai Owner mengirim konfirmasi eksplisit: `confirmations=[{"sourceSku":"KIT-001","canonicalUnit":"gr","packageQty":1000,"costBasis":"package"}]`. Jumlah dalam contoh adalah ilustrasi kontrak API, bukan default data produksi. Konfirmasi ini menetapkan bahwa HPP sumber merupakan harga kemasan dan isi dinyatakan dalam satuan stok tersebut. Pembagian HPP hanya dilakukan setelah konfirmasi ini.
- Stok sumber, kosong maupun terisi, tidak menghasilkan stok awal atau ledger. Gunakan penerimaan/opname setelah hitung fisik. Impor tidak mengaktifkan bahan arsip/draft dan tidak menghasilkan resep dari nama bahan.

## Verifikasi

Tes source/parser/planner, transaksi PGlite, baseline POS, perlindungan resep/biaya/stok, replay dan concurrency, serta API authorization tersedia di `material-reference-plan.test.ts`, `material-reference.integration.test.ts`, dan route test. Penerapan ke produksi, import produksi dan merge/deploy tidak dilakukan oleh tes.
