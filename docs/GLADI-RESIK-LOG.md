# Log Gladi Resik — Garage OS (Grand Opening)

Gladi dijalankan di **salinan DB** (`.tmp/gladi-db`, server port 3002), bukan di DB asli.

## Cara menjalankan ulang

1. Matikan server asli (port 3001).
2. Siapkan salinan DB + akun uji per peran (password acak, disimpan di `.tmp/gladi-accounts.json`):
   ```
   npx tsx src/scripts/gladi-setup.ts
   ```
3. Build terpisah supaya `.next` asli tidak tertimpa:
   ```
   $env:NEXT_DIST_DIR=".next-verify"; npx next build
   ```
4. Jalankan server gladi (atau lewat preview `garage-gladi`):
   ```
   node scripts/gladi-server.mjs
   ```
5. Jalankan 14 skenario otomatis (hasil juga ditulis ke `.tmp/gladi-result.json`):
   ```
   npx tsx src/scripts/gladi-scenario.ts
   ```
6. Opsional, isi papan dengan kondisi "shift ramai" untuk dicek di layar:
   ```
   npx tsx src/scripts/gladi-scenario.ts --stage
   ```

Setiap peran dibuka di host berbeda supaya sesinya terpisah dalam satu browser: `kasir.localhost:3002`, `bar.localhost:3002`, `dapur.localhost:3002`, `helper.localhost:3002`, `waiter.localhost:3002`.

## Hasil otomatis (2026-09-28)

| Putaran | Hasil |
|---|---|
| Awal | 14/15 — S12 gagal (temuan G-01) |
| Setelah perbaikan G-01 & G-02 | **15/15**, diulang → **15/15** (2× berturut-turut) |

Skenario yang dicakup:

| Kode | Skenario |
|---|---|
| S1 | POS varian harga + tiket BAR/DAPUR |
| S2 | QR hanya masuk produksi setelah kasir accept |
| S3 | Waiter tidak bisa validasi |
| S4 | 2 tamu 1 meja |
| S5 | Smart Batch ×4 + UNALLOCATED |
| S6 | Catatan beda = batch terpisah |
| S7 | Order belum lengkap |
| S8 | Helper panggil waiter tertentu / siapa saja |
| S9 | Kembalikan READY dengan alasan |
| S10 | Bill + split bill |
| S11 | Siklus meja |
| S12 | Void saat produksi |
| S13 | Finalisasi payroll harian |
| S14 | Hak akses negatif |

## Temuan

| ID | Sev | Temuan | Status |
|---|---|---|---|
| G-01 | **P1** | Order di-void saat sedang dibuat: tiketnya tetap aktif di Production, jadi Bar/Dapur tetap membuat dan waiter tetap mengantar. Porsinya juga tetap di batch. | ✅ Diperbaiki. `voidOrder` membatalkan tiket yang belum diantar (status `cancelled`), porsi dikeluarkan dari batch, batch kosong ikut batal. Layar Production menampilkan pita merah **"Dibatalkan — hentikan produksi"** selama 15 menit. Tes regresi di `garage-production.integration.test.ts`. |
| G-02 | P2 | Meja bisa ditandai "Tamu pergi"/bersih walau masih ada pesanan belum diantar, sehingga produk tertinggal dan tiket basi menumpuk. | ✅ Diperbaiki. `/lifecycle` (leave) & `/clean` menolak dengan `TABLE_HAS_UNDELIVERED` dan menyebut pesanan yang belum diantar (skenario S11). |
| G-03 | P2 | Header "Papan Lantai Waiter" sticky + transparan menutupi ±150px kartu di HP. | ✅ Sticky hanya di layar ≥ tablet. |
| G-04 | P3 | Teks "Dicek helper … tunggu dipanggil" terpotong di HP. | ✅ |
| G-05 | P3 | Tombol nama waiter di dialog ACC tanpa label aksesibilitas. | ✅ `aria-label` |
| G-06 | P3 | Meja kosong menampilkan timer besar (mis. "7643m"). | ✅ Timer hanya untuk meja terisi. |
| G-07 | P3 | Angka "Siap Antar" menghitung tiket yang belum dipanggil; nomor order terpotong 2 baris. | ✅ Angka = yang harus diantar waiter itu; nomor order di baris sendiri. |
| G-08 | P3 | Label POS "Siap Dapur" menyiratkan kasir menandai siap. | ✅ Jadi "Status Produksi" (monitor hanya-baca). |
| G-09 | Data | DB asli: **2 shift kas masih terbuka** (`CS-OUTLET-A-237551`, `CS-OUTLET-A-641009`); meja 01 & 07 masih "terisi" bill lunas 3–5 hari lalu; 5 tiket READY lama. | ⏳ Dibereskan saat H-1 (tutup shift + reset grand opening). |
| G-10 | P3 | Halaman `/order` memanggil `/api/member/profile` → 401 untuk tamu (error merah di console, tanpa dampak). | Dicatat, belum diperbaiki. |
| G-12 | P2 | Tabel `error_events`, `earnings_failed_queue`, `feedback_entries` ada di skema & snapshot Drizzle tetapi **tidak pernah dibuat migrasi SQL**. DB hasil migrasi tidak punya tabel ini, sehingga antrean fee gagal, pencatat error, dan feedback admin bisa error. Ditemukan lewat dry-run skrip reset. | ✅ Migrasi `0106_restore_missing_tables.sql` (`IF NOT EXISTS`). Tes di `garage-reset-grand-opening.integration.test.ts`. |
| G-11 | Info | Login dibatasi Better Auth ±3 percobaan/10 detik per IP. Di outlet tiap perangkat punya IP LAN sendiri → aman. Untuk VPS nanti: pastikan reverse proxy meneruskan `X-Forwarded-For`. | Catatan putaran VPS. |

## Bagian D — Gladi dengan staf asli (dipimpin owner)

Pakai server gladi (bukan server asli) di perangkat fisik. Target 15–20 pesanan. Semua temuan dicatat di tabel di atas (ID lanjut G-12, dst).

**Kasir (PC kasir + printer)**
- [ ] Buka shift, pesan dine-in atas nama tamu (Coffee Cold/Hot, Nasi Goreng Sedang/Pedas).
- [ ] Terima order QR dari HP tamu; tolak 1 order QR.
- [ ] Minta bill, Final Bayar, split bill 2 tamu.
- [ ] Void 1 order yang sedang dibuat dengan PIN manajer.
- [ ] Buka "Status Produksi" untuk memantau (tidak ada tombol Siap).
- [ ] Tutup shift.

**Bar / Dapur (tablet)**
- [ ] Tiket muncul otomatis dengan **Nama + Meja** terbaca dari ±1 meter.
- [ ] MULAI → QC · Ready.
- [ ] Batch: saran muncul, allocation per porsi, UNALLOCATED menahan.
- [ ] Kembalikan READY dengan alasan.
- [ ] Pita merah muncul saat order di-void.

**Helper Bar / Dapur (HP/tablet)**
- [ ] Hanya kolom READY yang relevan; ACC → cek fisik → panggil waiter (nama & beban tampil).
- [ ] Coba "Panggil siapa saja".
- [ ] Ganti waiter.

**Waiter (HP)**
- [ ] Suara/getar saat dipanggil.
- [ ] Banner "AMBIL DI BAR/DAPUR".
- [ ] Tap Diantar.
- [ ] "Tamu pergi" ditolak bila masih ada pesanan.
- [ ] DIRTY → CLEANING → AVAILABLE.
- [ ] Reservasi.

**Manajer**
- [ ] PIN approval void.
- [ ] Laporan Production.
- [ ] Atur workstation akun di Manajemen User.

Gate: **tidak ada P0/P1 terbuka** sebelum reset grand opening.
