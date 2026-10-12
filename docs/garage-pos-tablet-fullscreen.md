# Garage POS Laptop dan Thermal 57/58 mm

> **Update Okt 2026:** printer laptop kini diatur per perangkat di POS → Printer
> ("Printer Perangkat Ini"): Bluetooth, kabel USB, jaringan, atau printer umum lewat
> Chrome, tanpa driver. Lihat `docs/PRINTER-LAPTOP.md`. Bagian di bawah berlaku untuk
> mode "Printer umum (Chrome)".

POS kasir dipakai dari laptop Windows dengan cetak struk manual. Setelah
transaksi selesai, kasir menekan tombol `Cetak Struk`; browser akan membuka
dialog print sehingga printer thermal bisa dipilih atau dikontrol dari driver.

## Setup Printer Windows

1. Install driver printer thermal 57/58 mm.
2. Set ukuran kertas driver ke 57 mm atau 58 mm.
3. Jadikan printer thermal sebagai default jika kasir paling sering mencetak struk.
4. Gunakan Chrome atau Edge untuk membuka POS.

## Saat Cetak Struk

1. Selesaikan pembayaran di wizard POS.
2. Di langkah `Selesai`, tekan `Cetak Struk`.
3. Pada dialog print, pilih printer thermal.
4. Gunakan paper 57/58 mm, scale 100%, margin none atau minimum, dan matikan header-footer browser.

Auto print dari layar POS kasir tidak digunakan. Antrean `print-jobs` tetap boleh
dipakai untuk kebutuhan backend, dapur, atau riwayat, tetapi kasir mencetak struk
secara manual dari transaksi selesai.

## Fullscreen

Tombol `Kunci Fullscreen` hanya untuk menjaga layar POS tetap fokus di laptop.
Fullscreen bukan syarat cetak dan tidak mengubah dialog print browser.
