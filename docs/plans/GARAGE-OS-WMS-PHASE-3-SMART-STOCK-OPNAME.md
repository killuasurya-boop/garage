# Garage OS WMS — Phase 3: Smart Stock Opname & Loss Control

Branch: `feat/wms-phase3-smart-opname` (dari `main` 8149ca5). Tidak di-merge/deploy tanpa persetujuan Owner.

## 1. Kondisi existing (hasil audit kode)

| Area | Lokasi | Kondisi |
|---|---|---|
| Sesi opname | `wms_stock_opname` (draft → submitted → completed; reject → draft), `createWmsOpname` | Satu sesi per ruang; semua SKU yang punya baris stok di ruang itu jadi baris. Tidak ada jenis (harian/mingguan/bulanan) maupun cakupan (partial/full). |
| Baris hitung | `wms_opname_line` (`systemQty`, `physicalQty`, `countedAt`, `countedBy`), `saveWmsOpnameLine` | `systemQty` diambil **saat bahan dihitung** (konsep posting time ERPNext). Tidak ada riwayat hitung ulang. |
| Blind count | `getWmsOpname({ blind })`, route `GET /api/wms/opname/[id]` | Non-Owner/Manajer tidak melihat stok sistem & selisih. Hitungan **petugas lain** tetap terlihat. |
| Finalisasi | `finalizeWmsOpname` | `FOR UPDATE` + status `completed` → idempoten. Selisih = fisik − sistem saat hitung diterapkan ke stok live (`type: adjustment`, `allowNegative: true`). Pemisahan tugas: pengirim ≠ penyetuju kecuali Owner. Baris tak terhitung dilewati. |
| Ledger | `wms_stock_movement` (`valueHpp`, `balanceAfter`, `valuationRate`, `batchId`) via `recordStockMovement` | Sumber kebenaran tunggal; nilai historis tersimpan saat posting (moving average). |
| Waste | `wms_waste` + `src/lib/wms-waste.ts` | `recorded` memotong stok (FEFO, batch kedaluwarsa dulu); ≥ Rp50.000 oleh staf → `pending_approval`. `value` = biaya aktual saat dicatat. |
| Keuangan | `finance-control-core.ts` | Mode biaya **purchase** (dipakai Garage): HPP laba-rugi = belanja diterima; susut/opname/waste **tidak** jadi biaya kedua. Mode recipe: HPP resep + susut (waste + adjustment). |
| Satuan | `wms_product_uom`, `loadProductUoms`, `formatPacks`, `PackQtyInput` | Kemasan → satuan dasar sudah ada (bukan hardcode). |
| Izin | `wmsAllowedWarehouseTypes`, `WMS_ELEVATED_ROLES` | Pembuatan sesi dibatasi lokasi; **simpan baris, kirim, detail tidak dibatasi lokasi**. |

## 2. Risiko & masalah

1. **Izin lintas lokasi (keamanan):** pengguna `inventory:write` (mis. Kasir) dapat menyimpan hitungan / mengirim opname Gudang Utama dan melihat detailnya (blind) karena hanya pembuatan sesi yang memeriksa tipe ruang.
2. **Blind count bocor antar-penghitung:** angka fisik penghitung lain terlihat sebelum review.
3. **Edit hitungan = snapshot ulang:** menyimpan ulang mengambil `systemQty` sekarang. Benar bila memang dihitung ulang sekarang, tetapi tidak ada jejak hitungan awal → tidak bisa membedakan "koreksi ketik" vs "hitung ulang", dan riwayat recount hilang.
4. **Partial vs full tidak tegas:** sesi bisa dikirim dengan 1 baris terhitung; laporan tidak tahu cakupan yang dimaksud.
5. **Tidak ada toleransi/eskalasi:** semua selisih diperlakukan sama; tidak ada aturan recount atau eskalasi Owner berdasar nilai.
6. **Nilai kerugian tidak tersimpan per baris opname:** hanya di metadata audit (`varianceValue`) → laporan harus menebak dari ledger. Nilai historis tersedia di `wms_stock_movement.valueHpp` (refDoc `<OPN> · opname`).
7. **`allowNegative: true`** pada finalisasi: disengaja (penjualan sesudah hitung tetap sah). Dipertahankan, tetapi baris yang menghasilkan saldo negatif ditandai di laporan agar ditinjau, bukan diam-diam.
8. **Tidak ada penjadwalan / skor risiko / rekomendasi.**

## 3. Arsitektur perbaikan (tanpa ledger/opname paralel)

- **Tetap** memakai `wms_stock_opname` + `wms_opname_line` + `recordStockMovement` + `wms_waste`.
- **Snapshot per hitung:** setiap simpan hitungan mencatat `systemQty` saat itu di dalam transaksi yang mengunci baris stok ruang (`FOR UPDATE` pada `wms_warehouse_stock`) sehingga snapshot konsisten dengan urutan ledger. Finalisasi tetap menerapkan *delta* (fisik − snapshot) ke stok live → transaksi sesudah hitung tidak dihapus.
- **Riwayat hitung:** tabel `wms_opname_count` (append-only) menyimpan tiap percobaan (fisik, snapshot, penghitung, waktu, jenis: count/recount). Baris opname menyimpan hitungan pertama & terakhir.
- **Toleransi deterministik** (`src/lib/wms-opname-rules.ts`, murni & teruji): klasifikasi `match | minor | recount | manager | owner` dari kombinasi batas absolut per satuan, persen (tanpa bagi nol), nilai rupiah, dan riwayat selisih berulang. Konfigurasi di `app_settings` (`wms.opname.tolerance`), default terdokumentasi.
- **Posting idempoten:** status + `FOR UPDATE` (existing) + nilai per baris disimpan saat posting (`posted_variance`, `posted_value`, `posted_rate`).
- **Metrik kerugian** (`src/lib/wms-loss.ts`): dihitung dari kejadian sah unik — baris opname terposting & waste `recorded` — tidak dari snapshot harian; tidak membuat expense.
- **Skor risiko & jadwal hitung** (`src/lib/wms-cycle-count.ts`): formula terdokumentasi berbobot (dapat dikonfigurasi).
- **Rekomendasi** (`src/lib/wms-opname-insights.ts`): aturan → temuan + bukti + keyakinan/keterbatasan + dampak + tindakan + penanggung jawab + status (tabel `wms_opname_action`). Tidak pernah menyimpulkan pencurian.

## 4. Perubahan database / API (aditif)

Migrasi `0174_wms_smart_opname`:
- `wms_stock_opname`: `kind` (daily|weekly|monthly|incidental), `scope` (full|partial|cycle), `business_date`, `recount_requested_at`.
- `wms_opname_line`: `first_physical_qty`, `first_system_qty`, `count_attempts`, `needs_recount`, `recount_reason`, `classification`, `posted_variance`, `posted_value`, `posted_rate`, `posted_at`.
- `wms_opname_count` (riwayat hitung, append-only).
- `wms_opname_action` (tindakan rekomendasi + status).

API (semua cek peran **dan** lokasi di backend):
- `POST /api/wms/opname` + `kind`, `scope`, `productIds` (cycle).
- `PATCH /api/wms/opname/[id]` (hitung; idempoten per `clientRequestId`).
- `POST /api/wms/opname/[id]/recount` (Manajer/Owner, alasan wajib).
- `GET /api/wms/opname/loss?from&to&warehouse` (Owner/Manajer).
- `GET /api/wms/opname/priorities?warehouse` (skor risiko top 10).
- `GET /api/wms/opname/report?period=daily|weekly|monthly&format=json|xlsx|csv|pdf`.
- `GET|PATCH /api/wms/opname/actions`.

## 5. Workflow UI/UX

WMS → Smart Stock Opname (tab: Dashboard, Hitung Stok, Perlu Hitung Ulang, Approval, Analisis Selisih, Kerugian & Waste, Laporan, Rekomendasi).
Hitung: pilih ruang + jenis → daftar bahan (progress, belum dihitung abu-abu) → kartu bahan besar (foto, SKU, satuan) → input kemasan utuh + kemasan terbuka (satuan dasar) → total otomatis → **Simpan & Lanjut** (status simpan: menyimpan/tersimpan/gagal + coba lagi; tidak pernah "tersimpan" palsu). Warna: abu belum, biru sedang, amber perlu perhatian, merah kritis, hijau sesuai, ungu menunggu persetujuan — selalu dengan ikon + teks. Motion 150–250 ms, `motion-reduce`.

## 6. Rencana implementasi bertahap

1. **3A** perbaikan integritas: izin lokasi semua endpoint opname, blind antar-penghitung, snapshot terkunci, riwayat hitung. + tes.
2. **3B** sesi jenis/cakupan, full wajib lengkap, cycle count dari daftar prioritas, input kemasan.
3. **3C** aturan toleransi, minta hitung ulang, eskalasi Owner, posting menyimpan nilai per baris.
4. **3D** metrik kerugian (gross shortage/surplus, waste, unexplained, net, accuracy, coverage).
5. **3E** laporan harian/mingguan/bulanan + ekspor (report-engine existing: PDF berlogo, XLSX, CSV).
6. **3F** skor risiko, top 10 prioritas, rekomendasi + pelacakan tindakan, endpoint read-only untuk Aya.
7. **3G** UI tab, responsive, aksesibilitas, regresi.

## 7. Strategi testing

Vitest + PGlite (harness existing). Unit: aturan toleransi (termasuk sistem 0), konversi kemasan, skor risiko. Integrasi: blind (API & lintas penghitung), izin lokasi, snapshot vs penjualan/receiving/transfer sesudah hitung, double finalize (paralel), recount menyimpan riwayat, self-approval, eskalasi Owner, gross shortage/surplus + nilai historis, waste tidak dobel, agregasi periode & business date, partial vs full, ratusan SKU (performa wajar). Lalu lint, typecheck, seluruh tes, build, `release-check`.

## 8. Risiko deployment

- Migrasi aditif saja; baris lama `first_*` dibiarkan null (diperlakukan = nilai sekarang).
- Sesi opname yang sedang `draft/submitted` saat deploy tetap jalan (kolom baru default aman; `scope` default `partial` = perilaku lama).
- Izin lokasi lebih ketat: Kasir/Waiter tidak lagi bisa mengisi opname Gudang Utama (perubahan perilaku yang disengaja).
- Tidak ada perubahan laba-rugi; metrik kerugian hanya analisis.

## 9. Acceptance criteria

Lihat Definition of Done di brief Owner; setiap butir dibuktikan dengan tes otomatis atau uji browser yang dilaporkan apa adanya (termasuk yang belum dikerjakan).
