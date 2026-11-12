# Production V7 — Command Center Produksi

Owner, 12 Nov 2026. Peningkatan Production Hub V4 (bukan penulisan ulang): aturan transisi tiket, cetak tiket SELESAI,
batch, serah-terima waiter, SLA di Pengaturan, dan suara **tidak diubah**.

## A. Hasil audit ("kartu hilang sendiri")

Tidak ada proses yang mengubah atau menghapus tiket berdasarkan waktu di database. Semua perubahan status adalah aksi staf.
Kartu "hilang" berasal dari tampilan:

| # | Penyebab (V4) | Sifat | Perbaikan V7 |
|---|---|---|---|
| 1 | Grid berhalaman + urut "prioritas" (telat → menunggu → diproses): pesanan baru mendorong kartu yang sedang dikerjakan ke halaman 2 | tampilan | Tiga kolom yang di-scroll, **tanpa halaman**, urut FIFO tetap |
| 2 | Filter bawaan "produksi" membuang kartu Siap; di tablet antrean Siap tersembunyi di balik tombol | tampilan | Kolom SIAP selalu tampil di ≥ 768 px; di HP tab "Siap Antar" |
| 3 | Server menyembunyikan tiket SIAP berumur > 8 jam | server | Dihapus — SIAP tampil sampai staf menutupnya |
| 4 | Server hanya memuat 300 tiket **terbaru** (yang terlama terbuang diam-diam) | server | Muat aktif terlama dulu, batas 600, dan peringatan `truncated` bila terlampaui |
| 5 | Gagal sinkron hanya teks kecil di footer; data lama tampil tanpa label | tampilan | Chip sinkron + banner "KONEKSI TERPUTUS / MENYAMBUNG ULANG — data terakhir pukul …" |

Belum bisa dipastikan mana yang terjadi di outlet (tidak ada akses data produksi); #1 kandidat terkuat.

## B. Yang dibangun

- **Aturan murni** `src/lib/production-v7.ts`: `fifoSort` (waktu masuk server → nomor tiket; override resmi di depan),
  `boardColumns` (menunggu / diproses / siap / siap-hari-sebelumnya — tidak ada yang dibuang), `fifoPositions` (per stasiun),
  `queueLabel`, `jumboTable`, `orderProgress`, `productionKpis`, `productionIndicators` (15 kode, masing-masing: apa, kenapa,
  tiket mana, tindakan, dan jenis **Fakta / Hitungan / Saran**), `syncHealth`, `batchFifoAhead`.
- **Server** `garage-production.ts`: `getProductionBoard` (lihat #3, #4), `setFifoOverride` (Owner/Manajer, alasan wajib,
  hanya tiket menunggu/diproses, kunci baris, audit `Production FIFO override` / `… removed`).
  Endpoint yang sudah ada `POST /api/production/tickets/[ticketNo]` menerima aksi `prioritize` / `unprioritize`
  (tidak ada endpoint baru).
- **Migrasi 0193** `kitchen_tickets.fifo_override_at/_by/_by_name/_reason` (4 kolom nullable, tanpa backfill).
- **UI** `src/components/garage/production-hub/`:
  - `order-card.tsx`: nomor meja jumbo, nomor antrean, posisi FIFO (BAR/DAPUR nn saat papan gabungan), status berlabel,
    nama pemesan hanya bila tercatat ("Nama tidak dicatat"), catatan item, kesiapan stasiun lain.
    **Seluruh kartu = tombol buka detail** (`.phv7-cover`); aksi produksi hanya lewat tombol aksi. Ketuk kartu tidak
    pernah mengubah status.
  - `order-detail.tsx`: identitas, ringkasan waktu, progres terverifikasi (dari status porsi tersimpan), item per stasiun
    + batch, jejak waktu, cetak; footer tetap (`OrderDetailFooter`): aksi utama + Dahulukan / Kembalikan ke FIFO.
    Tiket yang keluar dari papan saat panel terbuka → pemberitahuan + aksi dimatikan (tidak diganti diam-diam).
  - `production-hub-v4.tsx`: baris KPI, kolom MENUNGGU | DIPROSES | SIAP, laci detail non-modal di tablet/desktop
    (kartu lain tetap bisa diketuk), lembar penuh di HP dengan tombol tutup, lembar Indikator, banner sinkron.
  - `batch-view.tsx`: saran batch menampilkan meja + nomor order asal, catatan "kartu asal tetap di papan", dan peringatan
    urutan FIFO bila ada pesanan yang masuk lebih dulu di luar batch.
- **Palet** `.phv4` di `globals.css` (token `--phv4-*`, kontras AA dijaga `production-v7-tokens.test.ts`); denyut tanpa henti
  pada kartu kritis diganti garis statis; animasi hanya transform/opacity, mati pada `prefers-reduced-motion`.

## C. Yang sengaja TIDAK dibuat

- Prediksi waktu selesai, skor staf, atau "AI" — tidak ada datanya. Indikator hanya dari data papan + target di Pengaturan.
- Batas SLA baru: tetap memakai `SlaConfig` outlet.
- Antrean aksi offline: saat offline aksi **ditolak dengan jelas**, bukan disimpan untuk dikirim nanti.
- Tidak ada tiket yang otomatis ditandai selesai/diantar oleh waktu.

## D. Uji

| Lapisan | Berkas | Cakupan |
|---|---|---|
| Unit | `production-v7.test.ts` | FIFO + seri, override, posisi, kolom (100 tiket), KPI, 15 indikator, sinkron, keadilan batch |
| Unit | `production-v7-tokens.test.ts` | kontras AA, tanpa animasi tanpa henti, reduced motion |
| Integrasi (PGlite) | `production-v7.integration.test.ts` | SIAP > 8 jam tetap ada, tiket berhari-hari terdepan, muat ulang identik, override: hak, alasan, audit, status & waktu masuk tidak berubah |
| Browser | manual (Chromium) | 1366×900, 1024×768, 390×844: ketuk kartu ≠ ubah status, ganti kartu saat laci terbuka, Dahulukan, Mulai, offline → banner + jumlah kartu tetap, 120 tiket (70/30/20) tanpa halaman |

## E. Rollback

1. Kode: revert PR ini (satu commit merge). UI V4 kembali utuh.
2. Database: kolom `fifo_override_*` nullable dan tidak dibaca kode lama — **boleh dibiarkan**. Bila ingin dibuang:
   `ALTER TABLE kitchen_tickets DROP COLUMN fifo_override_at, DROP COLUMN fifo_override_by, DROP COLUMN fifo_override_by_name, DROP COLUMN fifo_override_reason;`
3. Deploy memakai alur biasa (backup otomatis sebelum migrasi, health check, rollback otomatis bila gagal).

## F. Risiko tersisa

- Penyebab pasti di outlet belum terkonfirmasi dari data nyata; pantau 1–2 shift setelah rilis.
- Di 1366 px laci detail menutupi kolom DIPROSES/SIAP selama terbuka (kolom MENUNGGU tetap terlihat).
- Preferensi layar lama (`garage:phv4:prefs`: filter, urutan, kepadatan) tidak dipakai lagi; hanya zoom yang tersisa.
- > 600 tiket aktif sekaligus: yang terbaru tidak dimuat, tetapi layar memberi peringatan jelas.
