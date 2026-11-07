# OTP WhatsApp untuk pendaftaran member (Owner, Nov 2026)

Keputusan Owner: pakai **OTP WhatsApp** untuk membuktikan nomor milik pendaftar sebelum akun member dibuat atau
digabung ke data customer POS (menutup risiko P1 di `docs/CX-ENGINE-V4.md`).

## Cara kerja
1. Pendaftar isi nomor → **Kirim kode ke WhatsApp** (`POST /api/member/auth/otp/request`).
2. Server membuat kode 6 angka, menyimpan **hanya HMAC**-nya (`member_otp_challenges`, migration 0183), lalu
   mengirim template WhatsApp kategori *Authentication* langsung ke Cloud API (tidak lewat `whatsapp_messaging_queue`,
   supaya kode tidak pernah tersimpan polos).
3. Pendaftar memasukkan kode (`POST /api/member/auth/otp/verify`) → token sekali pakai (15 menit, disimpan HMAC).
4. `POST /api/member/auth/register` dengan `otpToken`: token dicek untuk nomor yang sama, lalu ditandai terpakai.
   Customer ditandai `wa_verified_at` (nomor terverifikasi pemiliknya sendiri).

Batas: kode berlaku 5 menit · maks. 5 percobaan per kode · jeda kirim ulang 60 detik · maks. 3 kode / 15 menit dan
8 / hari per nomor · rate limit per IP (kirim 5/menit, cek 20/menit). Pesan error provider hanya di log server.

## Aturan pendaftaran
| Kondisi | OTP aktif | OTP belum aktif |
|---|---|---|
| Nomor baru | wajib OTP | boleh daftar (seperti dulu) |
| Nomor sudah ada di data POS **dengan riwayat** (poin, kunjungan, atau transaksi lunas) | wajib OTP | **ditolak** — "verifikasi kode WhatsApp atau minta bantuan kasir" |
| Nomor sudah ada di POS tanpa riwayat | wajib OTP | boleh daftar |

UI menampilkan langkah OTP **hanya** bila provider benar-benar terkonfigurasi (`GET /api/member/auth/otp/status`),
sesuai kontrak member #13 (tidak ada tombol OTP palsu). Dipakai di `/member-login` dan sheet daftar di invoice.

## Aktivasi (Owner)
1. **WhatsApp Business Platform (Cloud API)** di Meta Business Manager, nomor bisnis Garage terverifikasi.
2. Buat template kategori **Authentication**, bahasa **Indonesian (id)**, dengan tombol **Copy code**. Isi body
   ditentukan Meta ("*{{1}}* adalah kode verifikasi Anda."); aktifkan pesan keamanan & masa berlaku 5 menit bila ditawarkan.
3. Isi env server (jangan di repo):
   - `WHATSAPP_CLOUD_PHONE_NUMBER_ID` — ID nomor dari Meta.
   - `WHATSAPP_CLOUD_API_TOKEN` — token System User (atau integrasi WhatsApp yang sudah tersambung di Garage OS).
   - `WHATSAPP_OTP_TEMPLATE` — nama template, mis. `garage_otp`.
   - opsional `WHATSAPP_OTP_TEMPLATE_LANG` (default `id`), `WHATSAPP_CLOUD_API_VERSION` (default `v23.0`),
     `MEMBER_OTP_ENABLED=false` untuk mematikan sementara.
4. Uji di staging dulu (staging mematikan kunci messaging keluar — isi env khusus staging bila mau uji kirim nyata).

**Biaya:** Meta menagih pesan kategori *Authentication* per pesan terkirim (tarif Indonesia, lihat halaman harga
WhatsApp Business Platform). Batas kirim per nomor di atas membatasi biaya penyalahgunaan.

## QA / E2E tanpa provider
`MEMBER_OTP_DEV_ECHO=1` (diabaikan saat `NODE_ENV=production`): kode dikembalikan di respons dan tampil sebagai
"Mode uji (bukan produksi)". Tes: `member-otp-rules.test.ts`, `member-otp.integration.test.ts`.

## Belum termasuk
- Lupa PIN lewat OTP (bisa memakai tabel & alur yang sama, `purpose` baru).
- Status terkirim/dibaca OTP dari webhook (provider message id sudah disimpan).
