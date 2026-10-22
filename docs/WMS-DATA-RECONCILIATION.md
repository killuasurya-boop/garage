# Rekonsiliasi Data Master Excel v3.1 ↔ Garage OS (Okt 2026)

- **Sumber:** `docs/data/Garage_Coffee_Master_Pro_Final_v3.1_POS.xlsx` (18 sheet, cut-off 19 Okt 2026).
- **Dibaca oleh:** `src/lib/master-workbook.ts` + `src/lib/master-import-plan.ts`.
- **Cara jalan:** Owner menjalankannya di **Gudang → Kelola Master → Impor Master Excel** (Pratinjau, lalu Terapkan).

Angka di dokumen ini adalah hasil pratinjau terhadap katalog seed Garage (`src/lib/garage-data.ts`). Database produksi bisa berbeda, karena produk bisa ditambah lewat aplikasi. Hasil sebenarnya tampil di layar pratinjau.

## Integrasi lanjutan W2

Migrasi impor sekarang `0146_master_import`, mengikuti `0145_event_menu_commerce` di main. Baca `docs/wms-w2-release.md` sebelum deploy. Ini tidak berarti impor sudah dijalankan di produksi.

- Reimport resep yang sudah ditolak/diarsip dilewati tanpa menghidupkan draft baru. Alasan penolakan tetap tersimpan.
- Jumlah resep wajib positif. kg/gr dan liter/ml dapat dikonversi secara eksplisit; massa tidak disamakan dengan volume. Baris tidak valid memblokir draft resep tersebut.
- Apply bersamaan dikunci dalam transaksi dan direncanakan ulang dari data terbaru.
- Aktivasi, HPP, audit, dan sinkron BOM menu berlangsung dalam satu transaksi.

## Aturan yang dipakai

- **Data POS:** produk, varian, harga jual, dan kategori POS **tidak diubah dan tidak dibuat**. Hash baseline POS terbukti sama sebelum dan sesudah impor (tes integrasi).
- **Bahan:** bahan baru hanya **ditambah** (insert-only).
  - SKU yang sudah ada tidak ditimpa.
  - Selisih harga atau isi kemasan hanya dilaporkan.
  - Nama yang sama di area yang sama tidak dicocokkan otomatis; dicatat sebagai `unverified` di `master_crosswalk`.
- **Resep Dapur:** masuk sebagai **DRAFT**. Status ini tidak memotong stok dan tidak masuk HPP menu. Resep baru aktif setelah Owner/Manajer menekan **Setujui** di "Resep draft menunggu persetujuan".
- **Bahan virtual** (V-*: allowance energi, saus, kerupuk, garam, teh base, lemon powder) **bukan stok**, jadi tidak diimpor. Biayanya tidak masuk HPP sampai diganti bahan nyata.
- **Pemetaan kode bar:** `BAR-9NN` di Excel = `BAR-0NN` di Garage (urutan sama, 1:1).
- **Pemetaan resep ke menu:** resep dihubungkan ke menu lewat `POS Menu Register` (kolom "Menu HPP Link"), lalu dicocokkan dengan nama menu POS dan variannya. Pencocokan tidak memakai nama resep saja.

## A. Data valid yang diimpor

40 bahan Dapur (KIT-001…040) diimpor ke kategori:
- `Dapur · Bahan Baku`;
- `Dapur · Gas & Kebersihan` untuk gas dan sunlight.

HPP per satuan dihitung = harga kemasan ÷ isi.

**Belum tervalidasi** (confidence LOW atau isi kemasan tidak tercatat, sehingga biaya dihitung per kemasan):
KIT-007 belacan, KIT-016 garam, KIT-027 telur (asumsi 30/papan), KIT-028 indomie (asumsi 40/dus), KIT-032 gas, KIT-033 saos sasa, KIT-034 kerupuk, KIT-035 sunlight, KIT-036 bumbu balado (asumsi 100 g), KIT-038 kecap inggris, KIT-040 minyak wijen.

10 resep Dapur menjadi draft. HPP referensi tidak termasuk allowance virtual:

| Excel | Menu POS | HPP referensi | Allowance dilewati |
|---|---|---|---|
| KT-001 | Indomie Kuah | Rp3.015 | energi mie |
| KT-002 | Indomie Goreng | Rp3.373 | energi mie |
| KT-003 | Nasi Goreng | Rp4.503 | kerupuk, energi |
| KT-004 | Ayam Penyet | Rp8.533 | garam, energi |
| KT-005 | Nasi | Rp1.085 | energi nasi |
| KT-006 | Nugget | Rp5.090 | saus, energi |
| KT-007 | Sosis | Rp5.090 | saus, energi |
| KT-008 | Kentang Ori | Rp4.155 | garam, energi |
| KT-009 | Kentang Balado | Rp4.505 | energi |
| KT-010 | Mix Plater | Rp6.800 | saus, energi |

KT-004 Ayam Penyet punya baris bahan ganda di Excel (minyak 12 + 5 g, tomat 8 + 10 g). Saat impor keduanya **dijumlah** (17 g, 18 g).

## B. Konflik — data Garage dipertahankan (keputusan owner)

| SKU | Bahan | Kolom | Excel | Garage |
|---|---|---|---|---|
| BAR-014 | Drip Powder Coklat | Harga kemasan | 145.000 | 220.000 (owner: angka 145.000 keliru) |
| BAR-017 | Gula | Isi kemasan | 500 ml | 600 ml |
| BAR-018 | Fresh Milk | Isi / harga | 1.000 ml / 23.800 | 22.704 ml (dus 24×946) / 276.500 |
| BAR-035 | Biang Teh Prendjak | Harga | 7.000/kotak | Rp3/ml (seduhan) |

Selisih resep bar (Excel tidak menimpa resep aktif Garage):
- **BR-013 Vanilla Latte:** Excel memakai Delifru Strawberry (BAR-911, confidence LOW). Garage memakai Drip Vanilla (BAR-005). **Garage benar.**
- **BR-009 Mont Blanc:** Excel memakai bahan virtual Buavita (rasa tak disebut). Garage memakai Buavita Cranberry 70 ml.
- **BR-027…030 Tea Series:** Excel memakai bahan virtual "teh base". Garage memakai BAR-035 Biang Teh.
- **BR-028 Lemon Tea:** Excel memakai bahan virtual "lemon powder". Garage memakai BAR-004 Drip Lemon.

## C. Produk tidak cocok (hanya laporan, tidak ada produk dibuat/dihapus)

**Ada di Excel, tidak ada di katalog seed Garage:**
- POS-011 Strawberry Tea (Cold) Rp15.000;
- POS-043/044 Red Velvet Cold/Hot (Rp22.000 / Rp20.000);
- POS-046/047 Taro Cold/Hot (Rp22.000 / Rp20.000).

Tidak dibuat otomatis. Bila produk ini sudah ditambahkan owner di produksi, pratinjau akan mencocokkannya.

**Ada di Garage, tidak ada di Excel (tetap dipertahankan):**
- Choco Kiss, Dark Charm (Non-Coffee, resep menyusul);
- Mineral (Minuman Botol);
- Apel Djarum, Black Matcha, LA Purple (Rokok).

**Harga jual:** semua 41 varian yang cocok **sama** antara Excel dan Garage.

## D. Temuan Excel yang masih terbuka (Audit & Notes / Action Tracker)

| Prioritas | Temuan | Dampak di Garage |
|---|---|---|
| P1 | Fresh Milk Rp276.500 vs Rp23.800/L | Sudah diputuskan owner: dus 24×946 ml. |
| P1 | Indomie 40 pcs/dus, telur 30/papan | Bahan ditandai "belum tervalidasi". Cocokkan invoice. |
| P1 | Bebek tidak ada SKU | Bebek Penyet tidak ada di POS aktif; tidak ada tindakan. |
| P1 | Lemon powder, teh base, satuan Gold Label g vs ml | Resep bar Garage memakai bahan nyata; konversi g≈ml tetap perlu ditimbang. |
| P2 | Simple syrup, cup/sedotan, bumbu balado, saos/kerupuk, gramasi Dapur | Resep Dapur tetap DRAFT sampai uji 3 batch. |
| — | Metode valuasi persediaan "PENDING APPROVAL" | Garage memakai **rata-rata tertimbang** (moving average) per penerimaan. Didokumentasikan; tidak diubah. |
| — | Global auto-deduct "LOCKED" | Resep bar Garage sudah aktif sejak Sep 2026 (keputusan owner). Resep Dapur baru aktif per menu setelah disetujui. |

## E. Mapping yang belum dapat dipastikan

- **Bahan dengan nama sama di area Dapur tetapi SKU berbeda:** dicatat `unverified` di `master_crosswalk`. Saat ini tidak ada; bila muncul di produksi, tampil di "Peringatan & konflik".
- **Resep dengan status `menu_not_found`:** menu POS belum ada di database. Muncul di tabel resep pratinjau.
