# Konsep Keuangan Garage (Okt 2026)

## Rumus profit bersih

```
Omzet bersih     = penjualan − diskon − refund − pajak − ongkir delivery
Belanja bahan    = barang diterima gudang hari itu (Bar / Dapur / Umum), dibayar cash
Biaya tetap      = upah karyawan + listrik + internet + iklan + sewa + overhead (per hari)
Biaya lain       = pengeluaran operasional lain + fee transaksi
Profit bersih    = Omzet bersih − Belanja bahan − Biaya tetap − Biaya lain
```

- **Belanja bahan = biaya.** Setiap penerimaan gudang yang diselesaikan (WMS Receiving atau Barang Masuk Supplier)
  otomatis tercatat sebagai pengeluaran kas **lunas** per area: "Belanja Bar", "Belanja Dapur", "Belanja Umum".
  Biaya tambahan (ongkir dll.) dibagi proporsional.
- **Tidak ada hutang supplier.** Belanja dibayar cash langsung, sehingga tidak ada tagihan "belum dibayar".
  Pelunasan tagihan lama dan pengeluaran manual kategori Belanja hanya mencatat uang keluar; profit tidak berkurang
  dua kali.
- **HPP resep** tetap dihitung, tetapi hanya sebagai info margin per menu dan anggaran harian.
- **Upah karyawan** Rp544.000/hari ikut dalam biaya tetap. Bila absensi Payroll mencatat upah aktual, angka aktual
  yang dipakai (tidak dobel).
- **Save Money** Rp100.000/hari adalah cadangan, bukan biaya.
- Dasar biaya bisa diganti di Finance → Pengaturan → "Biaya bahan baku dihitung dari" (Belanja gudang / Resep).
- **Laporan Harian Rekening Bersama** (Finance → Closing Keuangan, Nov 2026) memakai **HPP produk × qty terjual**
  (HPP resep / harga modal / harga setor mitra) supaya tim keuangan membaca laba per hari dari menu yang terjual:
  omzet bersih − HPP produk = laba kotor − upah − biaya tetap & operasional = laba bersih. Laporan ini baca saja dan
  tidak mengubah P&L Finance (yang tetap mengikuti pengaturan dasar biaya di atas). PDF 1 halaman/tanggal, Excel per periode.

## Alur belanja harian (siap operasional)

1. **Satu pintu:** semua barang yang disimpan di gudang dicatat lewat **Gudang → Penerimaan** (`/warehouse/receiving`).
   Menu lama "Barang Masuk Supplier" menolak bahan gudang dan mengarahkan ke Penerimaan, agar stok & belanja tidak dobel.
2. Isi supplier (opsional), **Dibayar** (Cash / Transfer / QRIS), **Tgl terima** (default hari ini, tidak boleh masa depan),
   ongkir di "Biaya tambahan", lalu **Selesaikan**. Belanja tercatat lunas pada tanggal terima.
3. **Salah input?** Owner/Manajer klik **Batalkan** pada penerimaan yang sudah selesai (wajib alasan): stok dikeluarkan
   lagi & belanjanya dihapus dari laporan. Lalu buat penerimaan baru yang benar. Bila stoknya sudah terpakai, pembatalan
   ditolak → koreksi lewat stok opname. Hari yang sudah Daily Closing tidak bisa diubah.
4. **Bahan habis pakai tanpa stok** (es batu, gas, sayur harian): Finance → Tambah Pengeluaran, kategori Belanja
   Bar/Dapur/Umum, centang **"tanpa stok gudang"** → ikut biaya belanja bahan. Tanpa centang = hanya uang keluar.
5. Anggaran harian Bar/Dapur (Finance → Biaya Harian & Belanja) dibandingkan dengan belanja nyata hari itu.
6. Finance Guard memberi peringatan bila profit bersih bulan berjalan di bawah target s/d hari ini.

## Target profit bersih = patokan balik modal

Isi **Finance → Pengaturan → Target profit bersih / bulan**. Lalu:
- Target harian = target bulanan ÷ jumlah hari di bulan itu.
- **Balik modal sesuai target** = sisa modal ÷ target per bulan (dengan perkiraan bulan & tahun).
- **Bulan ini vs target** = profit bersih bulan berjalan dibanding target sampai hari ini.
- **Laju aktual** = estimasi dari rata-rata 30 hari terakhir, sebagai pembanding.
- Dashboard Owner menampilkan rincian profit bersih hari ini dan selisihnya terhadap target hari ini.

## Stok awal sebelum grand opening

Belanja yang diterima gudang **sebelum Tanggal mulai usaha** tidak dihitung sebagai biaya. Belanja itu tampil sebagai
"Stok awal (bagian modal)" di kartu Balik modal.

## Langkah saat tanggal grand opening sudah pasti

1. Hentikan aplikasi, lalu jalankan reset data uji:
   `npm run db:reset-opening -- --apply --yes`.
   Ini menghapus order, pengeluaran, stok uji, dll. Pengaturan Finance, item biaya, dan modal tetap tersimpan.
2. Jalankan aplikasi lagi. Buka Finance → Pengaturan:
   - **Tanggal mulai usaha** = tanggal grand opening.
   - **Target profit bersih / bulan**.
   - **Modal (capital injection)**: isi modal awal yang benar. Nilai default Rp500.000.000 hanya contoh.
3. Terima stok awal lewat Penerimaan Gudang. Bila tanggalnya sebelum tanggal mulai usaha, stok itu tercatat sebagai
   stok awal (bagian modal).

Reset harus dilakukan **sebelum** stok awal diterima, karena reset juga mengosongkan stok gudang.

## Member & poin (Okt 2026)

- **Dapat poin:** 0,5 poin per Rp1.000 harga menu setelah diskon (tanpa pajak, service, ongkir) × pengali level:
  Silver 1x (±5%), Gold 1,2x (±6%), Platinum 1,6x (±8%), Ultra 2x (±10%). Poin masuk saat pesanan lunas.
- **Pakai poin:** langsung saat bayar — kasir (POS → pilih member → "Pakai poin") atau menu digital (member login →
  "Pakai poin"). 1 poin = Rp100, minimal 50 poin, maksimal 50% harga menu setelah promo/voucher. Saldo dipotong
  atomik (tidak bisa dipakai dobel), tercatat ke order.
- **Batal:** void / pesanan QR ditolak (termasuk auto-tolak 30 menit) → poin yang dipakai kembali utuh; refund →
  kembali proporsional. Bill yang memakai poin tidak bisa dipisah (split).
- **Hangus:** saldo poin hangus bila member tidak bertransaksi 12 bulan (dicek tiap malam 03:17 WIB).
- **Keuangan:** potongan poin mengurangi omzet bersih seperti diskon lain. Finance → P&L menampilkan "Diskon poin
  member" periode itu dan "Poin beredar" (kewajiban bila semua poin dipakai).
- Tukar poin terpisah (aplikasi member / CRM "Tukar Poin") dan tambah poin sendiri lewat API sudah ditutup.
- Semua angka diatur di Pengaturan → Loyalty & Member.
