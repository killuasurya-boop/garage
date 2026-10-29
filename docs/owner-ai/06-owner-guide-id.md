# Panduan Owner — AI Connect (Koneksi ChatGPT)

Tidak perlu terminal. Semua dari Garage OS (laptop atau HP) + ChatGPT web.

## Menyambungkan ChatGPT (sekali)

1. Masuk Garage OS sebagai Owner. Pastikan **2FA akun Anda aktif** (tanpa 2FA ChatGPT selalu ditolak).
2. Buka menu **AI Connect** (sidebar Garage Control, atau klik chip **AI …** di kanan atas).
3. Langkah 1 harus centang (**Server MCP: Online**).
4. Langkah 2: klik **Salin** URL MCP.
5. Langkah 3: klik **Buka ChatGPT web** → Settings → Apps & Connectors → buat connector baru (custom MCP) → tempel URL →
   pilih OAuth → login dengan akun Owner + kode 2FA → izinkan.
   *Catatan:* fitur connector & kemampuan mengubah data tergantung paket ChatGPT Anda. Bila menu tidak ada, berarti paket belum
   mendukung — Garage OS tidak bisa memaksanya.
6. Langkah 4: klik **Buat kode verifikasi**. Di ChatGPT ketik: *"Verifikasi koneksi Garage OS dengan kode XXXX-XXXX"*.
7. Dalam beberapa detik halaman berubah **Terverifikasi** dan chip menjadi **AI VERIFIED** (hijau).

Kode berlaku 10 menit, sekali pakai, 5 kali salah = terkunci (buat kode baru). Bukti berlaku 24 jam; setelah itu status
**Perlu verifikasi ulang** (kuning) — ulangi langkah 6, bukan berarti rusak.

## Arti warna chip

| Chip | Arti |
|---|---|
| AI VERIFIED (hijau) | Server online + ChatGPT terbukti tersambung dalam 24 jam |
| AI STANDBY (kuning) | Tersambung tapi belum/perlu verifikasi ulang, atau sedang dijeda |
| AI RUNNING (biru) | ChatGPT sedang menjalankan perubahan yang Anda setujui |
| AI ERROR (merah) | Server MCP mati atau akun Owner tanpa 2FA |
| AI NOT SETUP (abu) | Belum pernah disambungkan |

"Akses tool: Baca & ubah" hanya muncul setelah perubahan data dari ChatGPT **benar-benar berhasil**; sebelum itu "Belum terbukti".

## Darurat

- **Jeda semua akses ChatGPT** (saklar di AI Connect): semua perintah ChatGPT langsung ditolak. POS, kasir, dashboard tetap jalan.
- **ChatGPT boleh mengubah data** dimatikan: ChatGPT hanya bisa membaca & melapor.
- **Cabut** (per koneksi) / **Cabut semua**: isi alasan + kode 2FA. Token di ChatGPT langsung tidak berlaku; untuk tersambung lagi
  ChatGPT harus login Owner + 2FA ulang. Data bisnis tidak berubah.

## AI Command Center (tanpa ChatGPT)

Menu **AI Command** → pilih perintah (cari "harga", "stok", "setoran") → isi → **Tampilkan / Jalankan**.
Perintah yang mengubah uang, stok, poin, peran (R2/R3) **tidak langsung jalan**: muncul **Ringkasan — BELUM dijalankan**. Periksa,
lalu **Setujui & jalankan** (R3: ketik kode 2FA). Hasil = **Receipt** (nomor operasi + sidik) dan tercatat di **Timeline operasi**
bersama perubahan dari ChatGPT. Ringkasan berlaku 5 menit, sekali pakai; isian yang diubah setelah ringkasan = harus lihat ringkasan ulang.
