# Smart Partner Hub — Panduan UAT di Staging

Panduan langkah demi langkah untuk menguji PR killuasurya-boop/garage#191 (branch `claude/partner-hub-gate0`) di
**staging**, sebelum ACC deploy produksi. Staging memakai database terpisah dan data samaran
(`docs/STAGING.md`), jadi data produksi tidak tersentuh.

## 0. Deploy ke staging (Owner/tim, dari laptop)

```bash
git fetch origin
git checkout claude/partner-hub-gate0
git pull
bash scripts/deploy-staging.sh --refresh-data
```

- `--refresh-data` mengisi staging dengan salinan produksi terbaru yang sudah disamarkan, lalu migrasi
  0188 berjalan di database staging.
- Buka https://staging.garagecoffee.id. Login akses `staging` memakai password dari
  `/root/garage-staging/STAGING_ACCESS.txt`, lalu login Garage OS dengan akun biasa (tanpa 2FA).
- Cek cepat: semua halaman lama (POS, Bar/Dapur, laporan) masih jalan normal **sebelum** Partner Hub dinyalakan.

## 1. Persiapan pilot (Owner + Manajer)

Contoh data dari PRD. Angka harga/HPP **harus** diganti dengan angka kesepakatan resmi dengan mitra, jangan dari
gambar papan desain.

| Langkah | Siapa | Di mana | Hasil yang diharapkan |
|---|---|---|---|
| 1. Nyalakan **Partner Hub aktif di outlet ini** | Owner | Pengaturan → kategori Partner Hub | Menu POS "Partner Hub (Mitra)" muncul |
| 2. **Daftarkan mitra**: kode `PAU`, nama "Es Krim Pokat Au", telepon WA, titik serah-terima | Manajer | `/partners` → Kelola Mitra | Status `draft` |
| 3. Isi kesepakatan + jam last order (mis. Minggu–Jumat 21:45, Sabtu 22:45) → **Simpan kesepakatan & jam** | Manajer | Kelola → Status & kesepakatan | Tersimpan |
| 4. Tambah rekening, lalu **Verifikasi** | Manajer tambah, Owner verifikasi | Kelola → Rekening penerima | Nomor tampil disamarkan `•••• 1234` |
| 5. Buat akun login mitra (nomor HP + PIN 6 angka) | Manajer | Kelola → Akun Portal Mitra | Akun aktif |
| 6. Tambah produk "Es Krim Pokat", harga jual & HPP sesuai kesepakatan | Manajer | Kelola → Produk mitra & harga | Produk **nonaktif** sampai disetujui |
| 7. **Setujui** produk | Owner | Kelola → Produk mitra & harga | Produk aktif |
| 8. Ubah status mitra: verifikasi → disetujui → aktif | Manajer/Owner | Kelola → Status & kesepakatan (wajib isi alasan) | Gagal bila syarat belum lengkap (UAT-01) |
| 9. Set layanan **BUKA** | Mitra (Portal `/partner`) atau Manajer | Portal / Kelola Mitra | Produk mitra bisa dipesan di POS |

## 2. Skenario UAT

Centang kolom Hasil: ✅ sesuai / ❌ tidak (tulis catatan + screenshot). Gunakan **dua perangkat** untuk skenario
bertanda 📱📱.

### A. Ketersediaan & aktivasi
| UAT | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| 01 | Login Portal Mitra (`/partner`) sebelum mitra aktif | Ditolak | |
| 02 | Jual rokok/cookies seperti biasa di POS | Tanpa tiket Mitra, alur Quick Retail sama | |
| 03 | Mitra tandai produk **Habis** di Portal | POS & menu digital tampil HABIS, server menolak order | |
| 04 | Kasir coba paksa jual item HABIS (produk Garage biasa juga) | Ditolak server (DEC-13) | |
| 05 | Matikan internet HP mitra beberapa menit | Status tidak terkonfirmasi → order produk mitra ditolak | |
| 26 | Order setelah jam last order | Ditolak "lewat last order" | |
| 24 | Matikan Partner Hub di Pengaturan | Produk mitra hilang, produk Garage tetap jual normal | |

### B. Order & tiket
| UAT | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| 06 | Kasir: 1 kopi + 2 Es Krim Pokat, Meja 12 | Satu invoice; tiket Bar + tiket Mitra; tiket Mitra **tidak** muncul di Bar/Dapur | |
| 07 | Waiter "Pesankan" / bayar nanti dengan produk mitra | Tiket Mitra terbentuk | |
| 08 | Tekan bayar dua kali cepat / refresh saat kirim | Tidak ada tiket/baris mitra ganda | |
| 09 | Mitra: Terima → Proses → Siap Antar | Status ikut berubah di `/partners` Pesanan Mitra | |
| 13 | Order dibatalkan sebelum mitra memproses | Tiket batal; tanpa penjualan & tanpa kewajiban | |
| 14 | Ubah harga produk, lalu cek order lama | Order lama tetap harga lama | |
| 15 | Siap Antar tapi bill belum lunas | Status bayar tampil terpisah ("Belum bayar") | |
| 25 | Klik "Hubungi mitra" | WA terbuka tanpa HPP & tanpa nomor pelanggan | |

### C. Waiter
| UAT | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| 10 📱📱 | Dua waiter klik **Klaim & ambil** bersamaan | Hanya satu yang berhasil | |
| 11 | Order dengan dua mitra, antar satu dulu | Per tiket, yang lain tetap menunggu | |
| 12 | Pindah meja setelah tiket Mitra siap | Label meja di tiket ikut pindah | |
| — | Tiket siap > 3 menit belum diambil | Peringatan merah di Ambil dari Mitra | |

### D. Keuangan & settlement (Owner/Manajer)
Cocokkan angka dengan hitungan manual: **penjualan = qty × harga jual**, **kewajiban ke mitra = qty siap ×
HPP**, **profit Garage = penjualan − HPP**. Selisih harus **Rp0** antara layar, PDF, dan hitungan manual.

| UAT | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| — | Keuangan Mitra, periode hari ini | Angka sesuai rumus di atas | |
| 16 | Refund 1 Es Krim Pokat (lewat approval) | Penjualan berkurang; kewajiban HPP tetap; refund **berhasil** walau seluruh qty item direfund | |
| — | Void order setelah mitra Siap Antar | Penjualan 0, kewajiban HPP tetap | |
| 17 | Tutup shift kasir dengan kewajiban mitra belum dibayar | Tutup shift tidak terblokir | |
| — | Buat settlement → Ajukan → Owner Setujui | Muncul satu biaya "HPP Mitra" di Finance; baris tidak bisa direkap dua kali | |
| 18 | Catat pembayaran sebagian lalu sisanya | Status Parsial → Lunas; Manajer mencatat, Owner verifikasi | |
| 19 | Catat transfer dengan referensi yang sama dua kali | Ditolak | |
| — | Manajer Batalkan & Owner Setujui hampir bersamaan 📱📱 | Hanya satu yang berhasil; tidak ada status tertimpa | |

### E. PDF & isolasi
| UAT | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| 22 | PDF sebelum vs sesudah disetujui | DRAFT bertanda air; FINAL berlogo resmi, nomor versi + checksum | |
| 21 | PDF dengan banyak baris | Header tabel berulang tiap halaman; total = jumlah baris | |
| 20 | Login sebagai mitra kedua, buka tiket/PDF mitra pertama | Tidak ditemukan | |
| 23 | (Opsional, teknis) logo resmi tidak ada | PDF FINAL ditolak, tidak terbit tanpa logo | |

## Hasil UAT otomatis (11 Nov 2026)

`e2e/partner-hub-uat.spec.ts` menjalankan skenario di atas di **server nyata dengan database baru** (bukan mock):
login sungguhan per peran (Owner, Manajer, Kasir, 2 Waiter, 2 akun mitra), Portal Mitra lewat UI 390 px.
Jalankan: `npm run test:e2e -- e2e/partner-hub-uat.spec.ts --project desktop-1366`. Hasil: **6/6 lulus**.

| Blok | Isi | Hasil |
|---|---|---|
| A | Daftar mitra → rekening diverifikasi Owner → akun → produk disetujui → aktif; lompat status ditolak; login portal sebelum aktif ditolak (UAT-01) | ✅ |
| B | Order kopi + 2 Es Krim Pokat Meja 12 = tiket Mitra benar (UAT-06); TUTUP / HABIS / lewat last order ditolak server (UAT-03/04/26) | ✅ |
| C | Portal Mitra Terima → Mulai Proses → Siap Antar tanpa error/overflow (UAT-09); 2 waiter klaim bersamaan → tepat 1 berhasil, lalu diantar (UAT-10) | ✅ |
| D | Refund **seluruh** qty item mitra berhasil; void setelah Siap Antar; batal sebelum diproses. Angka Portal Mitra = panel staf = hitungan manual: jual 66.000, bersih 44.000, kewajiban 76.000 (selisih Rp0) (UAT-13/16) | ✅ |
| E | Rekap dobel ditolak; batal vs setujui bersamaan → tepat 1 menang; payout parsial → lunas; referensi ganda & lebih bayar ditolak; PDF DRAFT/FINAL; mitra lain 404 (UAT-18/19/20/22) | ✅ |
| F | Hub dimatikan → produk mitra ditolak, produk Garage tetap terjual (UAT-24) | ✅ |

Masih perlu dilihat langsung oleh manusia (tidak bisa diotomatisasi penuh): HP mitra kehilangan sinyal (UAT-05),
pindah meja fisik (UAT-12), tampilan PDF 100+ baris di printer (UAT-21), dan rasa pakai kasir/waiter di jam ramai.

## 3. Setelah UAT

1. Kirim hasil (tabel di atas + screenshot ❌) ke sesi Claude. Semua ❌ diperbaiki di PR #191 lalu di-deploy ulang ke staging.
2. Pastikan backup produksi terbaru ada dan restore drill lulus (`docs/DEPLOY_VPS.md`).
3. Owner menulis **"ACC deploy Partner Hub"**. Baru setelah itu PR #191 di-merge (Deploy VPS otomatis + migrasi 0188).
4. Di produksi, setelan tetap **OFF** setelah deploy. Nyalakan untuk satu outlet dan satu mitra sebagai pilot.

Rollback darurat (hanya bila perlu, butuh izin Owner): `docs/partner-hub/0188-down.sql`.
