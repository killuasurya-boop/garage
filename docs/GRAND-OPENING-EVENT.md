# Grand Opening Garage Coffee: Website & Undangan Digital

Dokumen ini adalah runbook operasional untuk PRD **GC-PRD-EVENT-001**.
Acaranya Sabtu, 24 Oktober 2026, pukul 15.00–23.00 WIB.

## Satu sumber data

Data acara disimpan sebagai **satu baris** di tabel `events` dengan `slug = grand-opening`. Baris yang sama dibaca oleh:

| Dibaca oleh | Keterangan |
|---|---|
| Banner homepage (`/`) | Tampil hanya bila status Terbit dan acara belum selesai. |
| Landing `garagecoffee.id/grand-opening` | Mengembalikan 404 selama status masih Draft. |
| Undangan pribadi `garagecoffee.id/undangan/<token>` | Berlaku selama event Draft maupun Terbit (mati bila event diarsipkan, undangan dicabut, atau tamu diarsip). Tidak diindeks dan tidak tercantum di sitemap. |

Konten diedit di **Garage OS → Undangan Digital → Konten Event**. Selain fakta acara, panel ini juga mengatur konten poster di landing:

- **Rundown** (jam WIB): default 15.00–18.00 Live Music dan 20.00–23.00 Diskoyoks.
- **Teks promo**: default "Diskon 20% Menu Bundling". Bila dikosongkan, section promo disembunyikan.
- **Sponsor**: tampil hanya sebagai teks "Supported by BLACK", tanpa logo atau gambar produk, sampai aset resmi dan ketentuan tayang dari Djarum diterima.
- **Gerbang usia 21+**: aktif, wajib selama ada sponsor produk tembakau. Konfirmasi pengunjung disimpan di browser pengunjung.

 Bila tanggal, jam, alamat, atau link Maps diubah, versi konten naik dan perubahannya tercatat di Audit.

## Persiapan (H-5 s/d H-2)

1. Owner memeriksa Konten Event. Isi hanya fakta yang sudah pasti. FAQ dan galeri boleh dikosongkan; bagian yang kosong tidak ditampilkan di website.
2. Owner menekan **Terbitkan**, lalu memeriksa tampilan di HP dan desktop:
   - `/`: banner Grand Opening dan tombol "Lihat Detail Acara".
   - `/grand-opening`: gerbang 21+, rundown, badge promo, tanggal, jam, alamat, tombol Maps, tombol WhatsApp `wa.me/6285121552341`, dan tombol Bagikan.
3. Manajer memasukkan daftar tamu, manual atau lewat impor CSV. Selalu lakukan pratinjau dulu, lalu simpan.
4. Tekan **Buat undangan**, lalu **Bagikan manual** ke setiap tamu. Tekan **tandai dibagikan** hanya setelah pesan benar-benar terkirim.
5. Pantau rekap RSVP setiap hari. Tamu bisa mengubah jawabannya sampai batas RSVP (default 24 Okt pukul 15.00 WIB).

## Hari H

- PIC event-day: _(isi nama)_. Laporan masalah disampaikan ke PIC lewat WhatsApp.
- Owner mengekspor CSV daftar hadir sebelum acara mulai, untuk meja penerima tamu.
- Bila sebuah link undangan bocor, buka tamu tersebut lalu pilih **Link baru** (link lama langsung mati) atau **Cabut**.
- Setelah acara selesai, banner homepage hilang otomatis. Landing tetap bisa dibuka dan menampilkan "Terima kasih".

## Smoke test setelah deploy

1. `/` → banner tampil (bila status Terbit) → tombol mengarah ke `/grand-opening`.
2. `/grand-opening` → tombol Maps membuka link resmi; tombol WhatsApp membuka nomor resmi tanpa mengirim otomatis.
3. Buat satu tamu uji, buat undangannya, buka linknya, lalu kirim RSVP. Pastikan rekap berubah. Setelah itu **arsipkan** tamu uji tersebut.
4. `/undangan/<token-acak>` → muncul halaman "Tautan tidak valid" tanpa data apa pun.

## Keamanan & privasi

- **Token undangan**: 32 karakter huruf+angka acak (tanpa `_`/`-` supaya format teks WhatsApp tidak merusak link; token lama tetap berlaku). Database menyimpan hash sha256-nya, ditambah salinan terenkripsi AES-GCM dengan kunci turunan `BETTER_AUTH_SECRET`. Token tidak pernah ditulis ke log.
- **Halaman undangan** hanya menampilkan nama penerima dan informasi acara. Daftar tamu lain tidak pernah ditampilkan, dan Referer tidak dikirim (`no-referrer`).
- **RSVP publik** dibatasi rate limit 10 permintaan per 10 menit per IP.
- **Akses modul**: Owner dan Manajer. Ekspor CSV dan tab Log hanya untuk Owner. Ekspor dilindungi dari formula injection dan setiap ekspor tercatat di Audit.
- **Status "Dibagikan"** adalah pernyataan petugas, bukan bukti pesan WhatsApp terkirim atau terbaca.

## Rollback

- Konten salah → perbaiki di Konten Event, atau tekan **Tarik ke draft** (banner dan landing langsung disembunyikan).
- Tabel event diklasifikasikan **KEEP** di `npm run db:reset-opening`, sehingga reset H-1 tidak menghapus tamu maupun RSVP.
