# Resep Usulan Garage — untuk verifikasi Owner (Okt 2026)

Dipasang otomatis oleh migrasi `0158_recipe_proposals` saat deploy. Resep disusun dengan sudut pandang barista & koki untuk **23 produk yang belum punya resep**. Semua resep berstatus **DRAFT**: tidak memotong stok dan tidak mengubah HPP sampai Owner/Manajer menyetujuinya.

## Cara verifikasi

1. Buka **Gudang → Kelola Master → Resep draft menunggu persetujuan**.
   - Setiap menu menampilkan HPP dan food cost per varian.
   - Bahan yang belum lengkap ditandai, misalnya *harga beli 0* atau *satuan beda*.
2. Cocokkan takaran dengan uji masak/racik (min. 3 batch). Ada dua cara mengubah resep:
   - **Produk → Edit → Resep bahan stok**: tekan *Pakai resep usulan*, ubah takarannya, lalu Simpan. Resep langsung aktif.
   - **Setujui** di Kelola Master bila resep sudah sesuai. Resep yang salah total bisa **Tolak** (diarsip, tidak dihapus).
3. Isi harga beli asli bahan di **Gudang → Inventory**, terutama bahan bertanda *asumsi* di bawah. Setelah itu HPP menu ikut terhitung ulang otomatis.
4. Stok awal bahan bisa dicatat langsung dari form produk (**+ Stok awal**). Pembelian baru tetap lewat **Gudang → Receiving** supaya masuk belanja.

## Data yang dibuat (insert-only, tidak menimpa data yang sudah ada)

- **52 bahan Dapur** `KIT-001…052`: 40 bahan dari Master Excel, plus bahan Burger/Kebab (roti burger, kulit kebab, daging kebab, fillet ayam, keju slice, tepung crispy, mayones, saus tomat, margarin, kertas/kotak). Kemasan beli diatur, misalnya kg, karung 10 kg, papan 30, pack.
- **5 stok produk jadi** `RTL-001…005`: Air Mineral (btl, dus 24) dan 4 rokok (bks, slop 10).
  - 1 botol/bungkus terpotong per penjualan setelah resepnya disetujui.
  - Harga beli diambil dari harga modal produk bila sudah diisi. Bila masih 0, isi harga modal di produk atau harga beli di Inventory sebelum Setujui.
- Bahan `KIT-*` yang sudah ada dari Impor Master Excel dengan satuan `bks`/`btl` tanpa berat bersih diubah ke gr/ml, **hanya bila stoknya masih kosong dan belum pernah ada mutasi**.
- Menu yang sudah punya resep aktif, draft, atau arsip **dilewati**.

## Asumsi harga yang wajib dicek (cocokkan dengan nota)

| Bahan | Asumsi | Catatan |
|---|---|---|
| Indomie (KIT-028) | 1 pack isi 10 = Rp29.000 → Rp2.900/pcs | Excel menganggap isi 40/dus (Rp725/pcs). Itu tidak wajar; harga pasar ±Rp3.000/pcs. |
| Telur (KIT-027) | 1 papan isi 30 = Rp48.000 | |
| Bawang merah Rp7.500/kg, bombay Rp10.000/kg, selada Rp6.000/kg | Dari Excel | Kemungkinan terlalu murah (harga pasar ±Rp35–45rb, ±Rp20–25rb, ±Rp25–30rb/kg). |
| Garam 1 kg, Saus Sasa 1 kg, Kerupuk 500 gr, Terasi 100 gr, Kecap Inggris 290 ml, Minyak Wijen 200 ml | Berat bersih tidak tercatat | |
| Roti burger isi 10 Rp15.000, kulit kebab isi 10 Rp20.000, keju slice isi 10 Rp18.000, fillet ayam Rp65.000/kg, daging kebab Rp90.000/kg, mayones/saus tomat/margarin per kg | Harga pasar umum | Ganti dengan harga supplier. |

## Catatan barista & koki

- **Minuman Milk Series** (Red Velvet, Taro) mengikuti standar Matcha/Coklat: powder 20 gr + fresh milk 100 ml.
- **Tea Pahit** = biang teh 150 ml tanpa gula, setara Ice Tea 130 ml + gula 20 ml.
- **Strawberry Tea** mengikuti Peach Tea: sirup Drip Strawberry 20 ml + teh 100 ml + gula 15 ml.
  - Harga Hot **Rp8.000** vs Cold Rp15.000 membuat food cost Hot ±51%. Kemungkinan salah ketik harga; cek di POS.
- **Choco Kiss** = coklat 12 gr + selai stroberi 8 ml + susu 100 ml. **Dark Charm** = coklat 15 gr + susu 80 ml + gula 10 ml. Takaran disesuaikan dengan harga Rp15–16rb.
- **Burger/Kebab**:
  - Porsi disesuaikan dengan harga jual (porsi street-food).
  - Varian "Telur" tanpa daging; daging kebab hanya di Spesial Komplit.
  - Varian **Telur Ayam** (Burger Rp10rb, Kebab Rp12rb) tetap 53–56% food cost walau fillet hanya 25 gr. Pertimbangkan menaikkan harga.
- **Ayam Penyet** memakai sambal penyet (cabe, bawang, tomat, terasi) + lalapan timun/kol. Nasi dijual terpisah.
- **Nugget/Sosis** 100 gr per porsi (Excel 120 gr) + saus sambal 25 gr.
- **Gas & energi** tidak masuk resep. Gas adalah biaya operasional (Belanja), bukan bahan per porsi.
- **Bahan bar yang belum dipakai resep mana pun**: Buavita Jeruk (BAR-034) dan Prendjak teh celup (BAR-029). Arsipkan bila memang tidak dipakai.

## Rincian resep (HPP dengan harga bahan saat migrasi)

### Burger Garage (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Telur | Rp8.000 | Rp3.953 | 49% |
| Telur Keju | Rp12.000 | Rp5.753 | 48% |
| Telur Ayam | Rp10.000 | Rp5.638 | 56% |
| Telur Sosis | Rp15.000 | Rp5.593 | 37% |
| Telur Nugget | Rp12.000 | Rp5.183 | 43% |
| Telur Crispy | Rp15.000 | Rp7.534 | 50% |
| Telur Keju Crispy | Rp18.000 | Rp9.334 | 52% |
| Spesial Komplit | Rp25.000 | Rp12.178 | 49% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Kertas Burger (KIT-050) | 1 pcs | Rp80 |
| Semua varian | Margarin (KIT-049) | 3 gr | Rp114 |
| Semua varian | Mayones (KIT-047) | 8 gr | Rp280 |
| Semua varian | Minyak Goreng (KIT-026) | 3 gr | Rp51 |
| Semua varian | Roti Burger (KIT-041) | 1 pcs | Rp1.500 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 8 gr | Rp144 |
| Semua varian | Selada (KIT-014) | 8 gr | Rp48 |
| Semua varian | Telur (KIT-027) | 1 pcs | Rp1.600 |
| Semua varian | Tomat (KIT-012) | 8 gr | Rp136 |
| Spesial Komplit | Fillet Ayam (KIT-044) | 50 gr | Rp3.250 |
| Spesial Komplit | Keju Slice (KIT-045) | 1 pcs | Rp1.800 |
| Spesial Komplit | Kotak Burger (KIT-052) | 1 pcs | Rp350 |
| Spesial Komplit | Minyak Goreng (KIT-026) | 10 gr | Rp170 |
| Spesial Komplit | Nugget (KIT-020) | 30 gr | Rp1.230 |
| Spesial Komplit | Sosis (KIT-021) | 30 gr | Rp1.230 |
| Spesial Komplit | Tepung Crispy (KIT-046) | 15 gr | Rp195 |
| Telur Ayam | Bumbu Ayam (KIT-030) | 3 gr | Rp60 |
| Telur Ayam | Fillet Ayam (KIT-044) | 25 gr | Rp1.625 |
| Telur Crispy | Fillet Ayam (KIT-044) | 50 gr | Rp3.250 |
| Telur Crispy | Minyak Goreng (KIT-026) | 8 gr | Rp136 |
| Telur Crispy | Tepung Crispy (KIT-046) | 15 gr | Rp195 |
| Telur Keju | Keju Slice (KIT-045) | 1 pcs | Rp1.800 |
| Telur Keju Crispy | Fillet Ayam (KIT-044) | 50 gr | Rp3.250 |
| Telur Keju Crispy | Keju Slice (KIT-045) | 1 pcs | Rp1.800 |
| Telur Keju Crispy | Minyak Goreng (KIT-026) | 8 gr | Rp136 |
| Telur Keju Crispy | Tepung Crispy (KIT-046) | 15 gr | Rp195 |
| Telur Nugget | Nugget (KIT-020) | 30 gr | Rp1.230 |
| Telur Sosis | Sosis (KIT-021) | 40 gr | Rp1.640 |

### Kebab Garage (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Telur | Rp10.000 | Rp4.719 | 47% |
| Telur Ayam | Rp12.000 | Rp6.404 | 53% |
| Telur Sosis | Rp17.000 | Rp5.949 | 35% |
| Telur Nugget | Rp17.000 | Rp5.949 | 35% |
| Telur Ayam Sosis | Rp20.000 | Rp7.634 | 38% |
| Telur Ayam Nugget | Rp20.000 | Rp7.634 | 38% |
| Spesial Komplit | Rp28.000 | Rp12.464 | 45% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Bawang Bombay (KIT-005) | 5 gr | Rp50 |
| Semua varian | Kertas Kebab (KIT-051) | 1 pcs | Rp80 |
| Semua varian | Kol (KIT-010) | 10 gr | Rp120 |
| Semua varian | Kulit Kebab (KIT-042) | 1 pcs | Rp2.000 |
| Semua varian | Margarin (KIT-049) | 3 gr | Rp114 |
| Semua varian | Mayones (KIT-047) | 8 gr | Rp280 |
| Semua varian | Minyak Goreng (KIT-026) | 3 gr | Rp51 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 8 gr | Rp144 |
| Semua varian | Saus Tomat (KIT-048) | 8 gr | Rp144 |
| Semua varian | Telur (KIT-027) | 1 pcs | Rp1.600 |
| Semua varian | Tomat (KIT-012) | 8 gr | Rp136 |
| Spesial Komplit | Bumbu Ayam (KIT-030) | 3 gr | Rp60 |
| Spesial Komplit | Daging Kebab Slice (KIT-043) | 20 gr | Rp1.800 |
| Spesial Komplit | Fillet Ayam (KIT-044) | 25 gr | Rp1.625 |
| Spesial Komplit | Keju Slice (KIT-045) | 1 pcs | Rp1.800 |
| Spesial Komplit | Nugget (KIT-020) | 30 gr | Rp1.230 |
| Spesial Komplit | Sosis (KIT-021) | 30 gr | Rp1.230 |
| Telur Ayam | Bumbu Ayam (KIT-030) | 3 gr | Rp60 |
| Telur Ayam | Fillet Ayam (KIT-044) | 25 gr | Rp1.625 |
| Telur Ayam Nugget | Bumbu Ayam (KIT-030) | 3 gr | Rp60 |
| Telur Ayam Nugget | Fillet Ayam (KIT-044) | 25 gr | Rp1.625 |
| Telur Ayam Nugget | Nugget (KIT-020) | 30 gr | Rp1.230 |
| Telur Ayam Sosis | Bumbu Ayam (KIT-030) | 3 gr | Rp60 |
| Telur Ayam Sosis | Fillet Ayam (KIT-044) | 25 gr | Rp1.625 |
| Telur Ayam Sosis | Sosis (KIT-021) | 30 gr | Rp1.230 |
| Telur Nugget | Nugget (KIT-020) | 30 gr | Rp1.230 |
| Telur Sosis | Sosis (KIT-021) | 30 gr | Rp1.230 |

### Kentang Balado (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp14.000 | Rp4.505 | 32% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Bumbu Balado (KIT-036) | 5 gr | Rp350 |
| Semua varian | Kentang Goreng Beku (KIT-022) | 150 gr | Rp3.900 |
| Semua varian | Minyak Goreng (KIT-026) | 15 gr | Rp255 |

### Kentang Ori (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp12.000 | Rp4.539 | 38% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Garam (KIT-016) | 2 gr | Rp24 |
| Semua varian | Kentang Goreng Beku (KIT-022) | 150 gr | Rp3.900 |
| Semua varian | Minyak Goreng (KIT-026) | 15 gr | Rp255 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 20 gr | Rp360 |

### Mix Plater (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp18.000 | Rp7.340 | 41% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Kentang Goreng Beku (KIT-022) | 75 gr | Rp1.950 |
| Semua varian | Minyak Goreng (KIT-026) | 20 gr | Rp340 |
| Semua varian | Nugget (KIT-020) | 55 gr | Rp2.255 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 30 gr | Rp540 |
| Semua varian | Sosis (KIT-021) | 55 gr | Rp2.255 |

### Nugget (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp12.000 | Rp4.720 | 39% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Minyak Goreng (KIT-026) | 10 gr | Rp170 |
| Semua varian | Nugget (KIT-020) | 100 gr | Rp4.100 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 25 gr | Rp450 |

### Sosis (Cemilan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp12.000 | Rp4.720 | 39% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Minyak Goreng (KIT-026) | 10 gr | Rp170 |
| Semua varian | Saus Sambal Sasa (KIT-033) | 25 gr | Rp450 |
| Semua varian | Sosis (KIT-021) | 100 gr | Rp4.100 |

### Ayam Penyet (Makanan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp18.000 | Rp8.685 | 48% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Ayam (KIT-031) | 180 gr | Rp6.300 |
| Semua varian | Bawang Merah (KIT-006) | 5 gr | Rp38 |
| Semua varian | Bawang Putih (KIT-004) | 3 gr | Rp108 |
| Semua varian | Bumbu Ayam (KIT-030) | 15 gr | Rp300 |
| Semua varian | Cabe Merah (KIT-001) | 4 gr | Rp360 |
| Semua varian | Cabe Rawit (KIT-003) | 6 gr | Rp408 |
| Semua varian | Garam (KIT-016) | 1 gr | Rp12 |
| Semua varian | Gula Pasir (KIT-017) | 1 gr | Rp19 |
| Semua varian | Kol (KIT-010) | 10 gr | Rp120 |
| Semua varian | Minyak Goreng (KIT-026) | 17 gr | Rp289 |
| Semua varian | Royco (KIT-018) | 1 gr | Rp45 |
| Semua varian | Terasi (KIT-007) | 2 gr | Rp140 |
| Semua varian | Timun (KIT-011) | 20 gr | Rp240 |
| Semua varian | Tomat (KIT-012) | 18 gr | Rp306 |

### Indomie Goreng (Makanan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp12.000 | Rp5.548 | 46% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Daun Pre (KIT-009) | 2 gr | Rp40 |
| Semua varian | Indomie (KIT-028) | 1 pcs | Rp2.900 |
| Semua varian | Kecap Manis (KIT-019) | 5 ml | Rp273 |
| Semua varian | Kol (KIT-010) | 15 gr | Rp180 |
| Semua varian | Minyak Goreng (KIT-026) | 5 gr | Rp85 |
| Semua varian | Sawi (KIT-013) | 15 gr | Rp300 |
| Semua varian | Telur (KIT-027) | 1 pcs | Rp1.600 |
| Semua varian | Tomat (KIT-012) | 10 gr | Rp170 |

### Indomie Kuah (Makanan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp12.000 | Rp5.326 | 44% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Cabe Rawit (KIT-003) | 2 gr | Rp136 |
| Semua varian | Daun Pre (KIT-009) | 2 gr | Rp40 |
| Semua varian | Indomie (KIT-028) | 1 pcs | Rp2.900 |
| Semua varian | Kol (KIT-010) | 15 gr | Rp180 |
| Semua varian | Sawi (KIT-013) | 15 gr | Rp300 |
| Semua varian | Telur (KIT-027) | 1 pcs | Rp1.600 |
| Semua varian | Tomat (KIT-012) | 10 gr | Rp170 |

### Nasi (Makanan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp5.000 | Rp1.085 | 22% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Beras (KIT-025) | 70 gr | Rp1.085 |

### Nasi Goreng (Makanan)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp15.000 | Rp5.265 | 35% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Bawang Merah (KIT-006) | 10 gr | Rp75 |
| Semua varian | Bawang Putih (KIT-004) | 3 gr | Rp108 |
| Semua varian | Beras (KIT-025) | 70 gr | Rp1.085 |
| Semua varian | Bumbu Nasi Goreng (KIT-029) | 20 gr | Rp400 |
| Semua varian | Cabe Merah (KIT-001) | 5 gr | Rp450 |
| Semua varian | Daun Pre (KIT-009) | 5 gr | Rp100 |
| Semua varian | Garam (KIT-016) | 1 gr | Rp12 |
| Semua varian | Kecap Manis (KIT-019) | 8 ml | Rp436 |
| Semua varian | Kerupuk (KIT-034) | 10 gr | Rp300 |
| Semua varian | Kol (KIT-010) | 20 gr | Rp240 |
| Semua varian | Minyak Goreng (KIT-026) | 12 gr | Rp204 |
| Semua varian | Telur (KIT-027) | 1 pcs | Rp1.600 |
| Semua varian | Tomat (KIT-012) | 15 gr | Rp255 |

### Mineral (Minuman Botol)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp5.000 | – | – |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Air Mineral (RTL-001) | 1 btl | harga beli belum diisi |

### Choco Kiss (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp16.000 | Rp6.889 | 43% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Cup (BAR-031) | 1 pcs | Rp440 |
| Semua varian | Drip Powder Coklat (BAR-014) | 12 gr | Rp3.474 |
| Semua varian | Drip Strawberry Jam (BAR-006) | 8 ml | Rp1.158 |
| Semua varian | Es Batu (BAR-032) | 1 cup | Rp400 |
| Semua varian | Fresh Milk (BAR-018) | 100 ml | Rp1.218 |
| Semua varian | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Dark Charm (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp15.000 | Rp6.540 | 44% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Cup (BAR-031) | 1 pcs | Rp440 |
| Semua varian | Drip Powder Coklat (BAR-014) | 15 gr | Rp4.342 |
| Semua varian | Es Batu (BAR-032) | 1 cup | Rp400 |
| Semua varian | Fresh Milk (BAR-018) | 80 ml | Rp974 |
| Semua varian | Gula (BAR-017) | 10 ml | Rp183 |
| Semua varian | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Red Velvet (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Cold | Rp22.000 | Rp6.074 | 28% |
| Hot | Rp20.000 | Rp5.674 | 28% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Cold | Cup (BAR-031) | 1 pcs | Rp440 |
| Cold | Drip Powder Red Velvet (BAR-012) | 20 gr | Rp3.816 |
| Cold | Es Batu (BAR-032) | 1 cup | Rp400 |
| Cold | Fresh Milk (BAR-018) | 100 ml | Rp1.218 |
| Cold | Sedotan (BAR-030) | 1 pcs | Rp200 |
| Hot | Cup (BAR-031) | 1 pcs | Rp440 |
| Hot | Drip Powder Red Velvet (BAR-012) | 20 gr | Rp3.816 |
| Hot | Fresh Milk (BAR-018) | 100 ml | Rp1.218 |
| Hot | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Strawberry Tea (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Cold | Rp15.000 | Rp4.510 | 30% |
| Hot | Rp8.000 | Rp4.110 | 51% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Cold | Biang Teh Prendjak (BAR-035) | 100 ml | Rp300 |
| Cold | Cup (BAR-031) | 1 pcs | Rp440 |
| Cold | Drip Strawberry (BAR-001) | 20 ml | Rp2.895 |
| Cold | Es Batu (BAR-032) | 1 cup | Rp400 |
| Cold | Gula (BAR-017) | 15 ml | Rp275 |
| Cold | Sedotan (BAR-030) | 1 pcs | Rp200 |
| Hot | Biang Teh Prendjak (BAR-035) | 100 ml | Rp300 |
| Hot | Cup (BAR-031) | 1 pcs | Rp440 |
| Hot | Drip Strawberry (BAR-001) | 20 ml | Rp2.895 |
| Hot | Gula (BAR-017) | 15 ml | Rp275 |
| Hot | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Taro (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Cold | Rp22.000 | Rp4.758 | 22% |
| Hot | Rp20.000 | Rp4.358 | 22% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Cold | Cup (BAR-031) | 1 pcs | Rp440 |
| Cold | Denali Powder Taro (BAR-015) | 20 gr | Rp2.500 |
| Cold | Es Batu (BAR-032) | 1 cup | Rp400 |
| Cold | Fresh Milk (BAR-018) | 100 ml | Rp1.218 |
| Cold | Sedotan (BAR-030) | 1 pcs | Rp200 |
| Hot | Cup (BAR-031) | 1 pcs | Rp440 |
| Hot | Denali Powder Taro (BAR-015) | 20 gr | Rp2.500 |
| Hot | Fresh Milk (BAR-018) | 100 ml | Rp1.218 |
| Hot | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Tea Pahit (Non-Coffee)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Cold | Rp8.000 | Rp1.490 | 19% |
| Hot | Rp8.000 | Rp1.090 | 14% |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Cold | Biang Teh Prendjak (BAR-035) | 150 ml | Rp450 |
| Cold | Cup (BAR-031) | 1 pcs | Rp440 |
| Cold | Es Batu (BAR-032) | 1 cup | Rp400 |
| Cold | Sedotan (BAR-030) | 1 pcs | Rp200 |
| Hot | Biang Teh Prendjak (BAR-035) | 150 ml | Rp450 |
| Hot | Cup (BAR-031) | 1 pcs | Rp440 |
| Hot | Sedotan (BAR-030) | 1 pcs | Rp200 |

### Apel Djarum (Rokok)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp18.000 | – | – |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Rokok Apel Djarum (RTL-002) | 1 bks | harga beli belum diisi |

### Black Matcha (Rokok)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp18.000 | – | – |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Rokok Black Matcha (RTL-003) | 1 bks | harga beli belum diisi |

### LA Manggo (Rokok)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp37.000 | – | – |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Rokok LA Manggo (RTL-005) | 1 bks | harga beli belum diisi |

### LA Purple (Rokok)

| Varian | Harga | HPP usulan | Food cost |
|---|---:|---:|---:|
| Regular | Rp37.000 | – | – |

| Untuk | Bahan | Takaran | Biaya |
|---|---|---:|---:|
| Semua varian | Rokok LA Purple (RTL-004) | 1 bks | harga beli belum diisi |

