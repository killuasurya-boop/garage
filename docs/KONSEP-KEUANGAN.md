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
