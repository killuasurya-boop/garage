# Panduan Owner

> Memantau bisnis, keputusan final persetujuan, pengaturan keuangan & gaji, dan pengawasan tim.
>
> Untuk: Owner · Diperbarui 2026-10-13. Dokumen ini dibuat otomatis dari `src/lib/role-guides/` (`npm run docs:guides`) — ubah di sana, bukan di sini.

## 1. Memantau bisnis

1. Dashboard / CEO Control: omzet, profit bersih, target, dan balik modal.
2. Profit bersih = omzet bersih − belanja bahan (penerimaan gudang lunas) − biaya tetap harian − biaya lain.
3. Laporan Penjualan per tanggal: produk, kategori, metode bayar, jam ramai, per kasir.
4. Warehouse → Keuangan & HPP dan Owner Analytics untuk food cost & nilai stok.

## 2. Keputusan final

1. Persetujuan: pengeluaran di atas batas Owner menunggu keputusan Anda.
2. Hanya Owner yang boleh menyetujui pengajuannya sendiri dan mengoreksi absen Manajer.
3. Membuka ulang closing harian/bulanan hanya Owner.

## 3. Pengaturan keuangan & gaji

1. Pengaturan Keuangan: biaya tetap harian, target profit bulanan, batas approval pengeluaran (Manajer & Owner), modal & saldo kas.
2. Batas approval otomatis (auto-sweep) memakai angka di Pengaturan Keuangan — tidak bisa diubah Manajer.
3. Payroll → Pengaturan: upah harian, lembur, fee per produk, potongan tetap, tanggal mulai kerja, THR.
4. Pajak & service saat ini 0%.

## 4. Tim & keamanan

1. Manajemen Tim: kelola akun Manajer dan semua karyawan. Akun baru / reset wajib ganti password sebelum bisa bekerja.
2. Profil karyawan: Manajemen Tim → Direktori → klik nama atau tombol Profil (juga di Payroll → Karyawan). Isi data diri, kontak darurat, rekening gaji, kontrak, dan unggah foto/KTP/CV.
   - **Penting:** NIK, nomor rekening, dan file KTP hanya terlihat penuh oleh Owner — Manajer melihat versi tersamar.
3. Pelamar yang dijadikan karyawan otomatis membawa WA, alamat, tanggal lahir, foto, KTP, dan CV dari lamarannya.
4. PIN Owner/Manajer hanya untuk persetujuan di tablet kasir — jangan diberikan ke kasir.
5. Audit: periksa void, refund, koreksi absen, penerimaan barang, dan perubahan harga.

## 5. WhatsApp pelanggan & WiFi member

1. Pengaturan → Pembayaran: isi Rekening transfer pelanggan (satu per baris: BANK | NOMOR | ATAS NAMA). Tampil di menu digital saat pelanggan pilih Transfer.
2. Pelanggan menu digital yang bayar Transfer/QRIS bisa mengunggah bukti bayar dan mengirim ringkasan pesanan ke WhatsApp Garage.
3. CRM: filter WA belum dicek untuk melihat member yang nomornya belum dipastikan aktif.
4. WiFi gratis khusus member: isi GARAGE_WIFI_SECRET & GARAGE_WIFI_ROUTER_KEY di server, aktifkan di Pengaturan → WiFi Member, lalu pasang perintah MikroTik dari Pengaturan → Integrasi → WiFi Gratis Member.
   - Tips: Panduan lengkap: docs/WIFI-MIKROTIK.md.

## 6. Grand Opening & Undangan Digital

Satu data event untuk banner homepage, halaman /grand-opening, dan undangan pribadi.

1. Menu Undangan Digital → periksa judul, tanggal, jam, alamat, link Maps, WhatsApp, dan highlight. Isi hanya informasi yang sudah pasti.
2. Tekan Terbitkan setelah semua benar. Banner homepage dan halaman garagecoffee.id/grand-opening langsung tampil.
   - **Penting:** Selama status Draft, halaman /grand-opening tidak bisa dibuka publik. Perubahan tanggal/jam/alamat tercatat di Audit.
3. FAQ dan galeri hanya tampil bila diisi; jangan isi performer/promo yang belum terkonfirmasi.
4. Rundown, teks promo, sponsor, dan gerbang usia 21+ diatur di panel yang sama. Sponsor tampil sebagai teks saja; gerbang 21+ wajib aktif selama sponsor produk tembakau.
5. Tamu & undangan pribadi: lihat panduan Manajer bab Undangan Grand Opening. Owner juga bisa Ekspor CSV dan melihat tab Log.

## 7. Agent AI (WhatsApp / Telegram)

OpenClaw / Hermes bisa mengontrol Garage OS dari WhatsApp atau Telegram memakai API key agent.

1. Pengaturan → Integrasi → API Key Agent AI → Buat key. Pilih hak akses: Owner penuh, Manajer, atau Baca-saja.
2. Salin key (hanya tampil sekali) dan konfigurasi MCP ke agent: URL /api/mcp + header Authorization: Bearer key.
   - **Penting:** Key Owner penuh bisa void/refund, catat pengeluaran, dan setujui pengajuan langsung. Jangan bagikan key; cabut segera bila bocor.
3. Semua aksi agent tercatat di Audit dengan nama "Agent <nama key>".
4. Panduan teknis lengkap: docs/AGENT-API.md.
