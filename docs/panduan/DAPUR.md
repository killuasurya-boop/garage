# Panduan Dapur (Koki)

> Membuat makanan dari antrean Production Hub, QC, memanggil waiter, mengatur stok habis, dan stok bahan.
>
> Untuk: Kasir · Diperbarui 2026-10-12. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Mulai kerja

1. Login dengan akun Anda. Layar pertama adalah Production (Bar & Dapur) dengan filter DAPUR sudah terpilih.
2. Absen masuk di menu Absensi (PIN, selfie, GPS).
3. Nyalakan Suara ON. Pakai Layar LCD untuk tampilan besar di tablet/TV station.
4. Printer Dapur: ON → tiket baru tercetak otomatis. Pengaturan → Tes cetak bila printer baru dinyalakan.
5. Akun produksi tidak memegang uang dan tidak membuka POS kasir.

## 2. Membuat pesanan

Kolom: Menunggu → Diproses → Siap. Kartu menunjukkan nama tamu, meja, item + catatan, dan waktu berjalan vs target.

1. Ambil tiket paling lama dulu (paling atas). Tekan Mulai.
2. Smart Batch: beberapa pesanan dengan menu & catatan sama bisa dibuat sekaligus — tekan Mulai batch ×N.
   - Tips: Batch: setelah selesai, tekan QC + Allocation lalu ketuk tiap porsi (Nama + Meja) sampai UNALLOCATED = 0, lalu Batch complete.
3. Selesai: tekan QC · Siap · Panggil → cek tampilan & catatan → QC OK · Siap · Panggil. Waiter otomatis dipanggil.
4. Timer merah = lewat target waktu. Kerjakan segera dan beri tahu kasir bila ada kendala.
5. Kartu bertuliskan Sebagian batal = sebagian porsi dibatalkan/direfund kasir. Buat hanya porsi yang tersisa di kartu.
   - **Penting:** Pesanan di bagian merah Batal jangan dibuat lagi.

## 3. Serah ke waiter

1. Kolom Siap menunjukkan Waiter dipanggil + timer. Lewat 3 menit belum diambil → muncul Belum diambil & pengingat suara.
2. Saat waiter mengambil, tekan namanya di Diambil oleh. Pesanan tercatat diantar.
3. Pesanan delivery diambil kurir lewat kasir — tiket tertutup otomatis saat kurir menekan Ambil pesanan.
4. Salah tandai Siap? Tekan Kembalikan ke proses dan tulis alasannya (sebelum waiter mengambil).

## 4. Menu habis

1. Bahan habis: tekan Stok Habis di atas layar, ketuk menu makanan yang tidak bisa dibuat → HABIS.
2. Menu HABIS terkunci di POS kasir & menu digital QR. Ketuk lagi untuk Tersedia saat bahan sudah ada.
3. Hanya menu station Anda yang bisa diatur.

## 5. Stok bahan (Gudang)

Stok bahan dicatat di menu Warehouse. Akun Bar/Dapur melihat ruang Outlet Bar / Outlet Dapur.

1. Cek bahan menipis di Warehouse → Dashboard / Inventory.
2. Butuh bahan dari gudang utama: Internal Order → pilih bahan & jumlah. Stok langsung pindah ke ruang outlet.
3. Stock Opname: buka sesi untuk ruang outlet, isi hitungan fisik tiap bahan yang dihitung, lalu minta Manajer menekan Finalisasi.
4. Bahan yang tidak Anda hitung tidak diubah saat finalisasi — hitung semua bahan yang memang dicek.
   - **Penting:** Stok bahan gudang tidak bisa diubah langsung dari modul Inventory. Penerimaan barang, transfer, dan penyesuaian dilakukan Manajer/Owner.
5. Jalankan Checklist / Cold Chain sesuai jadwal shift.

## 6. Selesai kerja

1. Pastikan kolom Menunggu & Diproses kosong atau sudah diserahkan ke shift berikutnya.
2. Bersihkan station, lalu absen pulang di menu Absensi dan logout.
