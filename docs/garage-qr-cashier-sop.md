# SOP Kasir QR Order GARAGE

## Tujuan

Memastikan order dari QR meja tidak langsung masuk kitchen sebelum kasir validasi.

## Langkah Kasir

1. Buka `/pos`.
2. Lihat panel `QR Orders`.
3. Saat order baru muncul, klik kartu order atau tombol `Detail`.
4. Cek:
   - nomor meja
   - nama customer
   - nomor WhatsApp
   - item dan catatan
   - total tagihan
5. Pilih action:
   - `Accept`: order valid, masuk kitchen, pembayaran nanti.
   - `Paid`: order valid dan sudah dibayar/manual kasir.
   - `Reject`: order salah, prank, meja tidak sesuai, atau customer batal.
6. Buka link invoice WhatsApp jika customer perlu receipt.
7. Lihat `QR Control hari ini` untuk pending lebih dari 3 menit, meja bermasalah, dan repeat customer yang perlu follow-up.
8. Pakai tab `Table Map` untuk melihat status 50 meja:
   - `pending`: order QR belum divalidasi.
   - `accepted`: order sudah masuk kitchen.
   - `paid`: pembayaran tercatat.
   - `ready`: kitchen siap antar.
   - `needs_cleaning`: meja perlu reset/bersih.
9. Jika outlet memakai TV display, buka `/display/customer-queue` di layar customer. Pastikan layar hanya menampilkan order/meja/status, bukan nama atau nomor WhatsApp.

## Aturan Penting

- Jangan tekan `Accept` jika meja/customer belum jelas.
- Jangan tekan `Paid` sebelum pembayaran benar-benar diterima.
- `Reject` tidak membuat kitchen ticket.
- `Accept` dan `Paid` membuat kitchen ticket.
- `Accept` dan `Paid` juga membuat print job kitchen ticket; `Paid` membuat print job receipt.
- Jika resep menu sudah dikonfigurasi, stok bahan otomatis berkurang sekali setelah `Accept` atau `Paid`.
- Jika tombol sedang loading, tunggu sampai selesai; jangan klik berulang.
- Jika ada order pending lama/test, laporkan ke supervisor sebelum mulai shift.
- Jika `SLA >3m` muncul, prioritaskan order tersebut sebelum lanjut transaksi lain.
- Repeat guest diarahkan daftar member saat customer datang kembali.
- Saat close/ganti shift, supervisor membuat `Shift Handover Report` untuk mencatat pending QR, delay kitchen, stock warning, dan issue meja.

## Target Operasional

- Order QR baru harus diproses kurang dari 15 detik setelah kasir melihat notifikasi.
- Kitchen hanya menerima order yang sudah divalidasi kasir.
- Semua penolakan harus tercatat sebagai audit log.
