# Printer di Laptop Kasir/Helper (Google Chrome)

Mulai Okt 2026, laptop bisa mencetak struk **langsung dari Chrome** tanpa pasang driver
atau menjalankan agen. Pengaturan disimpan **per laptop** (per browser), jadi tiap
laptop bisa memakai printer dan cara sambung yang berbeda.

Buka: **POS → ikon pengaturan kasir → tab Printer**, atau **Pengaturan → Printer**.
Bagian **Printer Perangkat Ini** berisi pilihan cara sambung, lebar kertas,
tombol **Hubungkan**, **Tes cetak**, dan pratinjau struk.

## Cara sambung

| Pilihan | Untuk | Langkah |
|---|---|---|
| **Kabel / Bluetooth (COM)** | RPP02N (Bluetooth atau kabel), printer kasir umum | Bluetooth: pair dulu di Windows (Pengaturan → Bluetooth → Tambah perangkat → RPP02N, PIN `0000` / `1234`). Lalu **Hubungkan** → pilih port "Standard Serial over Bluetooth link" atau port USB. Baud default 9600. |
| **Bluetooth LE** | Printer Bluetooth Low Energy | **Hubungkan** → pilih nama printer dari daftar Chrome. Tidak perlu pair Windows. |
| **Kabel USB langsung** | Printer USB yang tidak muncul sebagai port COM | **Hubungkan** → pilih printer. Di Windows, bila gagal dibuka, driver printer bawaan sedang memakai perangkat: pakai **Printer umum** atau ganti driver ke WinUSB (Zadig). |
| **Jaringan / LAN** | Printer IP (WiFi/LAN, port 9100) | Browser tidak boleh membuka koneksi printer langsung, jadi jalankan **Garage Print Agent** di laptop: `PRINT_METHOD=network PRINTER_HOST=192.168.x.x npm run print:server`. Alamat agen bisa diubah di panel (default `http://localhost:9100`). |
| **Printer umum (Chrome)** | Printer apa pun yang sudah terpasang di Windows | Struk dicetak lewat dialog print Chrome, ukuran 58/80 mm. Tanpa dialog: buat shortcut Chrome dengan tambahan `--kiosk-printing` lalu jadikan printer thermal sebagai default. |
| **Otomatis** (default) | Laptop yang belum diatur | Printer yang pernah dihubungkan, lalu agen lokal, lalu dialog print Chrome. Struk tidak pernah macet. Chit dapur/bar otomatis tidak memunculkan dialog. |

Chrome **mengingat izin** printer. Setelah sekali Hubungkan, struk berikutnya
langsung tercetak walau browser ditutup-buka. Mencabut izin: ikon gembok di
address bar → hapus akses perangkat.

Syarat: Google Chrome atau Microsoft Edge versi desktop, dan aplikasi dibuka
lewat HTTPS (alamat VPS). Safari/Firefox tidak mendukung Serial/USB/Bluetooth.
Pilihan yang tidak didukung tampil abu-abu beserta alasannya.

## Lebar kertas

- **58 mm** = 32 karakter per baris (RPP02N, kebanyakan printer Bluetooth).
- **80 mm** = 48 karakter per baris (printer kasir meja).

Semua kertas menyesuaikan lebar ini otomatis: struk pelanggan, bill sementara,
chit dapur/bar, slip tutup shift, rekap harian, dan tes cetak. Nama menu panjang
dibungkus ke baris berikut, dan harga/total tidak pernah terpotong. Opsi lain di
panel: potong kertas otomatis (printer dengan pisau) dan jumlah baris kosong di
akhir struk.

## Kertas manajemen

| Kertas | Isi | Cetak dari |
|---|---|---|
| **Slip Tutup Shift** | Kasir, jam buka/tutup, transaksi, omzet, diskon, per metode bayar, modal awal, kas seharusnya vs dihitung, selisih (LEBIH/KURANG), disetor, ditinggal di laci, pencocokan QRIS, tanda tangan Kasir & Manajer | POS setelah tutup shift ("Cetak slip (printer struk)"); Rekap Harian → tombol **Cetak slip** per shift |
| **Rekap Harian** | Jumlah shift, transaksi, omzet, rata-rata per struk, diskon, void/refund, per metode bayar, kas & selisih total, rincian tiap shift, peringatan shift belum ditutup, tanda tangan Manajer & Owner | Rekap Harian → **Cetak rekap** |
| **Tes cetak** | Penggaris lebar kertas, contoh baris menu & total | Panel printer → **Tes cetak** |

Pengaturan outlet (Pengaturan → Struk):
- **Kolom tanda tangan di slip manajemen** (default aktif).
- **Jumlah cetak slip manajemen** (1–3).

## Masalah umum

| Gejala | Solusi |
|---|---|
| "Printer belum terhubung" | Nyalakan printer → panel printer → **Hubungkan** lagi. |
| Huruf acak / kotak-kotak | Kecepatan port salah. Coba baud 9600 atau 115200. |
| Baris terpotong / turun ke bawah | Lebar kertas salah. Pilih 58 mm untuk RPP02N. |
| Port COM Bluetooth tidak muncul | Pastikan RPP02N sudah di-pair di Windows dan menyala. |
| Struk kosong saat kabel USB | Pakai **Kabel / Bluetooth (COM)**, atau **Printer umum** bila driver Windows sudah terpasang. |
