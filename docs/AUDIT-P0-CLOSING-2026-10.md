# Audit P0 & Rencana Final — Closing, Petty Cash, Pertanggungjawaban Kasir

Versi 2.0 • 25 Oktober 2026 • Owner: Surya • Zona waktu: Asia/Jakarta
Menyempurnakan *GarageOS Rencana Closing Balance* v1.0.

## 1. Ringkasan

Audit P0 dijalankan pada kode `main` setelah PR #70 (commit `d0452c4`). Metodenya bukan hanya membaca kode: skenario uji dari dokumen v1.0 dijalankan langsung terhadap fungsi aplikasi.

Hasil uji (`src/lib/closing-audit-probe.integration.test.ts`):
- **4 lolos**: perhitungan dasar kas laci sudah benar.
- **11 terbukti gagal**: setiap kegagalan sudah dicek terjadi karena alasan yang memang dimaksud, bukan error lain.

Kesimpulan utama:

1. **Rumus dasar laci benar.** Modal, tunai net (kembalian tidak ikut), QRIS tidak menambah laci, split hanya menghitung bagian tunai, belanja laci, dan setoran (T01, T03, T04, T06 lolos).
2. **Masalah terbesar: belum ada satu sumber saldo.**
   - "Kas seharusnya" adalah angka yang ditambah/dikurangi di 9 tempat berbeda di kode.
   - Laporan shift menghitung ulang dengan rumus sendiri, lalu menampilkan selisih keduanya sebagai "penyesuaian lain" tanpa penjelasan.
3. **Snapshot shift yang sudah ditutup bisa berubah.** Refund/void mengubah nominal pembayaran lama di tempat, tanpa transaksi pembalik.
4. **Status terlalu ramah.** Selisih ≤ Rp10.000 berlabel "ok". Shift berselisih bisa diberi status "verified". Manajer bisa memverifikasi shift miliknya sendiri.
5. **Petty cash** sesuai temuan v1.0, kini terbukti dengan tes:
   - Manajer mencatat pengeluaran sendiri langsung disetujui.
   - "Disetujui" langsung mengurangi saldo fisik.
   - Saldo bisa negatif.
   - Pembatalan mengubah saldo historis.

Tidak ada temuan yang membuktikan kecurangan. Data transaksi produksi belum direkonsiliasi karena audit ini tidak memakai database produksi (lihat §7).

## 2. Metode dan batasan

- **Kode yang dibaca**:
  - `cashier-accountability.ts`
  - `cash-drawer.ts`
  - `garage-service.ts`: buka/tutup shift, pembayaran & Final Bayar, split, refund/void, koreksi metode, batal pelunasan, kas keluar/masuk, biaya Finance
  - `shift-accountability-report.ts`
  - skema `cash_sessions`, `cash_movements`, `petty_cash_entries`, `shift_incidents`, `payments`
- **Uji runtime**: database PGlite terisolasi berisi migrasi lengkap. Data kas produksi tidak disentuh.
- **Batasan**:
  - VPS produksi tidak diperiksa (versi deploy dianggap = `main` per deploy #64).
  - Belum ada rekonsiliasi shift nyata.
  - Integrasi provider QRIS belum ada, jadi tidak bisa diuji.

## 3. Temuan terbukti (uji runtime)

| ID | Temuan | Bukti (skenario) | Dampak | Prioritas |
|---|---|---|---|---|
| A1 | Biaya Finance bermetode Tunai yang dicatat Owner **memotong laci shift Kasir yang sedang buka**, tanpa baris kas keluar. Kalau tidak ada shift terbuka, tidak memotong apa pun dan tidak ada peringatan. | T02: Owner catat "galon Rp200.000 (uang owner)" → kas seharusnya laci kasir −200.000, baris kas laci tetap 0 | Selisih misterius di laci kasir. Belanja salah sumber dana. | P1 kritis |
| A2 | Ada dua cara menghitung saldo laci. Laporan menutup perbedaannya sebagai "penyesuaian lain". | Setelah A1, laporan shift menampilkan `otherAdjustments = −200.000` | Perbedaan tidak bisa ditelusuri dari dokumen | P1 kritis |
| A3 | Selisih **Rp1–Rp10.000 berstatus "ok"** | T16: fisik kurang Rp1 → `discrepancyStatus = ok` | "Balance" palsu | P3 |
| A4 | Tutup shift **tanpa hitungan pecahan** diterima backend | T19: `actualCash` saja → shift tertutup | Hitungan tidak bisa diperiksa ulang | P3 |
| A5 | Refund/void tunai setelah shift asal ditutup **mengubah laporan shift lama**. Kolom `payments.amount` diubah di tempat. | T15: penjualan tunai shift A berubah dari 40.000 → 0 di laporan A setelah void di shift B | Snapshot closing tidak bisa dipercaya | P1 kritis |
| A6 | Manajer **memverifikasi shift miliknya sendiri** | Manajer buka, tutup, lalu verified → diterima | Tidak ada pemeriksa independen | P4 |
| A7 | Shift berselisih (−30.000) bisa diberi status **"verified"** tanpa syarat | T18 | Selisih tertutup label hijau | P3 |
| A8 | Petty cash yang dicatat Manajer/Owner **langsung disetujui** | T14 | Tidak ada pemeriksa kedua | P2/P4 |
| A9 | "Disetujui" **langsung mengurangi saldo fisik**. Tidak ada event "uang diserahkan". | T08 | Saldo buku ≠ uang di kotak | P2 |
| A10 | Pengeluaran petty cash **melebihi saldo** tetap disetujui; saldo jadi negatif | T11 | Saldo tidak masuk akal | P2 |
| A11 | Membatalkan entri yang sudah disetujui **mengubah saldo historis** (status → cancelled, bukan reversal) | T15-petty: saldo per waktu lalu berubah 10.000 | Laporan lama berubah | P2 |

## 4. Temuan dari baca kode (belum diuji runtime, tetap masuk perbaikan)

| ID | Temuan | Lokasi | Prioritas |
|---|---|---|---|
| B1 | Final Bayar tunai menambah laci sebesar **total order**, bukan nominal pembayaran yang dikonfirmasi. Berisiko bila sebagian order sudah dibayar metode lain. | `garage-service.ts` ±10767 | P1 |
| B2 | Refund/void tunai memotong laci shift yang sedang buka (berdasarkan prioritas), tanpa baris `cash_movements` | `applyCashExpenseToOpenSession` | P1 |
| B3 | `decidePettyCashEntry` membaca lalu menulis tanpa kunci baris/kondisi status. Dua keputusan bersamaan bisa sama-sama lolos (T12). | `cashier-accountability.ts` | P2 |
| B4 | `reviewCashSession` dan `verifyOpeningCash` tidak membatasi outlet untuk Manajer, dan modal awal bisa diverifikasi berulang | `cashier-accountability.ts` | P4 |
| B5 | Pelapor bisa menandai catatan kejadian "Selesai" sendiri | `updateShiftIncident` | P4 |
| B6 | Kunci idempoten order mengembalikan order lama **tanpa membandingkan isi** (T10 sebagian). Kas keluar/masuk, petty cash, dan setoran belum punya kunci idempoten (T24). | `createOrderImpl`, `recordCashMovement` | P1 |
| B7 | Supervisor yang menutup shift sendiri bisa memakai "sign-off manajer" atas dirinya | `closeCashSession` | P4 |
| B8 | Setoran/brankas hanya "kas keluar" berisi nama penerima. Belum ada status *dalam perjalanan / diterima / berbeda*, dan penerima tidak mengonfirmasi. | `cash-drawer.ts` | P3 |
| B9 | QRIS dicocokkan manual satu angka saat tutup shift. Belum ada bruto/fee/settlement/bank, dan status pending tidak terpisah. | `cash_sessions.qris_*` | P3 |
| B10 | Hanya ada akun **laci** dan **petty cash**. Brankas, bank, clearing QRIS, dan uang muka belum menjadi akun, jadi transfer antar-akun tidak bisa dicocokkan. | skema | P1/P2 |

## 5. Yang sudah benar (dijaga sebagai baseline)

- Rumus laci dasar: T01, T03, T04, T06 lolos.
- Satu shift terbuka per outlet; shift tambahan wajib PIN Manajer.
- Kasir tidak melihat kas seharusnya selama shift terbuka (`redactOpenShiftSummary`).
- Kas keluar ≥ batas / refund / setoran wajib PIN Manajer atau pengajuan. Pengajuan belum menggerakkan uang.
- Kas laci: status `recorded / pending_approval / rejected / voided`, tidak pernah dihapus, ada saldo sebelum/sesudah.
- Hitungan pecahan modal awal (total wajib = modal).
- Tutup shift memakai kunci baris (`FOR UPDATE`) dan menolak tutup ganda.
- Petty cash terpisah dari laci. Pengajuan kasir tidak mengubah saldo sampai diputuskan.

## 6. Rencana final (disempurnakan)

### 6.1 Satu buku kas (fondasi semua tahap)

Tabel baru `cash_ledger` berisi **satu baris per perpindahan uang yang benar-benar terjadi**. Semua angka saldo diturunkan dari buku ini:

- `account`: `drawer:<shiftId>`, `petty:<pemegang>`, `safe` (brankas), `bank:<rek>`, `qris_clearing`, `advance:<staf>`, `external` (pelanggan/supplier).
- Setiap posting punya **dua kaki** (dari → ke, nominal integer rupiah). Transfer antar-akun tidak pernah menjadi biaya atau penjualan.
- Kolom wajib: `idempotency_key` (unik), `source_type` + `source_id` (order/payment/refund/expense/petty/setoran), `occurred_at`, `posted_at`, `actor`, `approver`, `business_date` (Asia/Jakarta).
- **Immutable**: koreksi = baris pembalik baru yang merujuk baris lama (`reverses_id`). Tidak ada `UPDATE` nominal dan tidak ada `DELETE`.
- `cash_sessions.expected_cash` menjadi cache dari Σ ledger. Ada cek konsistensi; perbedaan diperlakukan sebagai bug dan dicatat di `wms_stock_issue`-style log, bukan "penyesuaian lain".
- Pembayaran: refund/void membuat baris pembayaran negatif baru (`payments.kind = refund`, `refunds_payment_id`). `amount` asli tidak diubah, sehingga snapshot shift lama tetap.

### 6.2 Tahapan

| Tahap | Isi | Menutup temuan | Syarat selesai (tes) |
|---|---|---|---|
| **P1 Buku kas** | `cash_ledger` + posting dari: penjualan tunai/split, Final Bayar (nominal pembayaran, B1), refund/void (baris pembalik, A5/B2), koreksi metode, batal pelunasan, kas keluar/masuk, biaya Finance (A1: wajib pilih sumber dana; "Tunai laci" hanya dari laci shift si pencatat, selain itu brankas/rekening/petty). Laporan & PDF membaca ledger (A2 hilang). Kunci idempoten + tolak payload beda (B6). | A1 A2 A5 B1 B2 B6 B10 | T01–T06, T10, T15, T22, T23 + rekonsiliasi `expected_cash` = Σ ledger untuk semua shift uji |
| **P2 Petty cash** | Status terpisah: `approval` (diajukan/disetujui/ditolak) × `payment` (belum/dibayar) × `settlement` (uang muka terbuka/dipertanggungjawabkan/kembali sisa). Saldo hanya dari event *dibayar*. Uang muka = akun `advance`. Pengisian kembali = transfer dari bank/brankas. Pembatalan = reversal. Cek saldo + posting atomik (`FOR UPDATE`). Bukti & penerima wajib saat *settle* (atau alasan + tenggat). | A8 A9 A10 A11 B3 | T07, T08, T09, T11, T12, T14, T15 |
| **P3 Closing** | Pecahan wajib di backend (T19). **Hitungan pertama tanpa target** disimpan sebagai snapshot + waktu potong. **Hitung ulang** pemeriksa tersimpan sebagai versi kedua. Status jujur (§8 v1.0): kas = balance hanya bila selisih Rp0 (A3); ambang Rp10.000 hanya menentukan perlu PIN/eskalasi. "Verified lengkap" ditolak bila ada selisih tanpa "selisih diakui", bukti kurang, atau setoran belum diterima (A7). Setoran: *direncanakan → diserahkan → diterima (penerima konfirmasi nominal) / berbeda* (B8). QRIS: bruto/refund per shift, settlement & fee terpisah, status pending (B9). Petty cash dihitung terpisah saat closing. | A3 A4 A7 B8 B9 | T16–T21, T24 |
| **P4 Kontrol akses** | Pengaju ≠ penyetuju; verifikator ≠ pemilik shift (A6, B7). Owner boleh sebagai pengecualian tercatat dan berlabel "tidak independen". Batas outlet untuk Manajer (B4). Persetujuan terikat nominal + versi; perubahan membatalkan. Pelapor tidak menutup kejadiannya sendiri (B5). | A6 B4 B5 B7 | T13, T14 + uji API langsung |
| **P5 Laporan & pilot** | Dashboard Owner: shift selisih, bukti lewat tenggat, uang muka terbuka, setoran belum diterima, QRIS berbeda. Ekspor PDF/Excel dari snapshot yang sama, berversi. Simulasi staf + 1 laci pilot. | — | T23, SOP berhasil dijalankan staf |
| **P6 Aktivasi** | Backup + uji restore, migrasi kompatibel (data lama → ledger dengan saldo pembuka disahkan Owner; entri lama ambigu ditandai `legacy_unverified`, tidak ditebak), aktivasi di batas shift. | — | T25, saldo pembuka disahkan |

Aturan rilis: P1 dan P3 tidak dirilis sebagian. Selama transisi, laporan lama dan baru dibandingkan secara baca-saja; tidak ada dua posting uang.

### 6.2a Status pelaksanaan (25 Okt 2026)

| Tahap | Status | Catatan |
|---|---|---|
| P1 | Selesai — PR #71, migrasi 0159, deploy #65 | Buku kas tunggal, sumber dana biaya Finance. |
| P2 | Selesai — PR #72, migrasi 0160, deploy #66 | Disetujui ≠ dibayar, pengaju ≠ penyetuju, saldo petty dari buku kas. Uang muka (`advance`) belum dipisah. |
| P3 | Selesai (PR berikutnya, migrasi 0161) | Pecahan wajib (tutup darurat = alasan + PIN Manajer). Status jujur: `ok` hanya Rp0, `minor` ≤ Rp10.000 (tidak dieskalasi), `review`/`critical` → antrean Persetujuan. Hitungan pertama kasir tetap; hitung ulang pemeriksa disimpan terpisah. "Verified" berselisih wajib "selisih diakui" + catatan. Setoran = ke Rekening Jago/BNI: laci → `deposit_transit` → rekening saat penerima (≠ penyetor) mengonfirmasi bukti setor. Kategori brankas dihentikan. QRIS settlement/fee (B9) belum. |
| P4 | Selesai (PR yang sama) | Verifikator ≠ pemilik shift (buka/tutup); Owner = pengecualian berlabel "tanpa pemeriksa kedua". Manajer dibatasi outletnya. Kejadian ditutup Manajer/Owner lain, bukan pelapor. |
| P5 | Selesai (dashboard) | `/control/cash-closing` → panel Pengawasan Kas: saldo buku kas (petty, setoran dalam perjalanan, arus bersih Jago/BNI yang tercatat), antrean tindakan (selisih belum diakui, pemeriksaan > 24 jam, setoran belum dikonfirmasi — bisa dikonfirmasi langsung, pengajuan kas laci, petty diajukan/belum dibayar, kejadian terbuka, QRIS beda), pengecualian kontrol (tutup darurat, tanpa pemeriksa kedua, cache ≠ buku kas), ekspor Excel dengan cap waktu snapshot dari data yang sama. Pilot staf = kegiatan operasional. |
| P6 | Selesai (PR berikutnya, migrasi 0162) | Baris isian migrasi 0159/0160 (`request_hash = 'legacy'`) = `legacy_unverified`, tidak ditebak ulang. Owner mengesahkan saldo nyata satu kali per akun (petty per outlet, Rekening Jago, Rekening BNI) di `/control/cash-closing` → "Saldo pembuka disahkan Owner": hitungan nyata + bukti, ditolak bila buku kas bergeser sejak layar dibuka. Selisih = satu baris `opening_balance` (pihak luar ↔ akun); pengesahan immutable, satu per akun. Laci diaktifkan di batas shift (modal awal dihitung pecahan); saldo laci shift lama tetap berlabel `legacy_unverified`. T25: sidik buku kas (`scripts/cash-ledger-fingerprint.sql` = `cashLedgerFingerprint`) sama sebelum backup dan sesudah restore — diuji otomatis (PGlite dump → load) dan prosedur VPS di `docs/DEPLOY_VPS.md`. |

### 6.3 Tes

`closing-audit-probe.integration.test.ts` menjadi alat ukur. Setiap `it.fails` yang diperbaiki diubah menjadi `it` pada PR tahap terkait. Tes T09, T10, T12, T13, T20–T25 ditambahkan di tahap masing-masing.

## 7. Keputusan yang dibutuhkan dari Owner sebelum P1/P2

1. **Daftar akun uang** dan saldo pembukanya:
   - laci per outlet
   - petty cash per pemegang (siapa?)
   - brankas
   - rekening (Jago? BNI?)
   - clearing QRIS
2. **Belanja dari laci**: dilarang (wajib petty cash), atau boleh dengan alur pengecualian + PIN?
3. **Dana tetap petty cash**, batas per transaksi/kategori/periode, dan tenggat bukti (mis. 1×24 jam).
4. **Pemeriksa independen**: bila hanya ada 1 Manajer, Owner memeriksa shift Manajer? Pengecualian diberi label.
5. **Toleransi**: ambang selisih yang wajib PIN/eskalasi (saat ini Rp10.000 / Rp50.000). Label "balance" tetap hanya Rp0.
6. **QRIS**: provider/bank mana, dan apakah mutasi diunggah (CSV) untuk dicocokkan otomatis?
7. **Rekonsiliasi data lama**: pilih 3–5 shift nyata terakhir untuk dicocokkan bersama (butuh akses baca data produksi atau ekspor PDF/Excel shift).

## 8. Yang bisa diberlakukan hari ini (tanpa kode)

- **Jangan mencatat biaya Tunai di Finance** kalau uangnya bukan dari laci shift yang sedang buka (A1). Untuk belanja dari uang Owner, pakai metode Transfer/Lainnya.
- Selisih berapa pun (termasuk ≤ Rp10.000) tetap ditulis di catatan tutup shift.
- Selalu isi hitungan pecahan saat tutup shift.
- Manajer tidak memverifikasi shift atau petty cash miliknya sendiri; mintakan ke Owner.
- Refund/void untuk penjualan shift yang sudah ditutup: catat juga di Catatan Kejadian shift yang sedang berjalan.
