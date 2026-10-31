# APEX WMS AI — Phase 0: Audit Awal & MVP Data Integrity Gate

Tanggal: 2026-11-01 (WIB) · Owner: Surya · Sumber: repository `main` SHA `1fab26e52d5b53c3d90e6d8bb1163aec6e425ae4`, Garage OS MCP R0.
Status: **AUDIT PARSIAL / READ ONLY**. Tidak ada perubahan produksi, migrasi, transaksi stok, PO, keuangan, atau konfigurasi otonomi.

## A. SYSTEM STATUS

| Komponen | Status berbukti | Rujukan |
| --- | --- | --- |
| GitHub | Ada: `killuasurya-boop/garage`, private, branch `main` | Repository metadata, 2026-11-01 |
| Runtime | Next.js 16.4.3 / React 19.2.4 / TypeScript, PostgreSQL + Drizzle, Better Auth | `package.json`, `docs/owner-ai/01-repository-audit.md` |
| VPS | Arsitektur Docker Compose/Caddy + prosedur deploy manual; **tidak diperiksa secara langsung pada VPS** | `docker-compose.yml`, `docs/owner-ai/08-deployment-checklist.md` |
| MCP Owner | `garage_ping` = OK; akun `Killua Surya · ChatGPT`, peran Owner. Bukti challenge `garage_verify_connection` **belum diberikan** | MCP 2026-11-01 02:43–02:46 WIB |
| WMS | Master bahan, satuan kemasan, lokasi stok, ledger, waste, PO, smart opname, reorder, supplier sudah ada | `src/lib/wms-*.ts`, `drizzle/0151..0174` |
| Opname | `wms-opname-rules.ts`, `wms-loss.ts`, `wms-opname-insights.ts`, UI & tes integrasi sudah ada | Berkas terkait |
| AI | `inventory_agent`, approval agent, AI config & action drafts sudah ada. **Bukan bukti adanya APEX agent yang tuntas** | `src/lib/garage-ai-agents.ts` |
| Tool MCP | Domain dan risk R0–R3 ada; raw WMS reads & endpoint catalog bekerja | `kemampuan_sistem`, `katalog_endpoint` |
| Policy autonomous WMS | **BELUM TERVERIFIKASI**: tidak ditemukan bukti policy delegasi khusus WMS Owner untuk financial auto-approval. `garage-ai-autopilot-policy.ts` yang diperiksa menangani jadwal dan notifikasi WhatsApp, bukan otorisasi PO deterministik | `src/lib/garage-ai-autopilot-policy.ts` |
| Persistent Memory | Ada tabel/objek AI konvensional (config, runs, events, context snapshots); memori versi panjang dengan provenance dan retrieval semantik **BELUM TERVERIFIKASI** | `src/lib/garage-ai-agents.ts`, `src/db/schema.ts` (parsial) |

## B. WHAT WAS IMPLEMENTED

Phase 0 hanya berisi audit repository serta live read-only MCP. Tidak ada klaim perubahan kode WMS yang sudah diimplementasikan di fase ini. Dokumen ini menjadi baseline review sebelum perubahan teknis.

### Profil mutu data aktual, grain dan temuan

- **Grain laporan opname:** baris hitung `(opname_id, product_id)` dari sesi completed, dikumpulkan per periode, serta agregasi `(product_id, warehouse_id)` untuk top loss; `coveredPairs` dibanding total pasangan bahan-ruang aktif.
- **Periode:** 2026-10-26 s/d 2026-11-01 WIB, diambil 2026-11-01 02:45 WIB via `ringkasan_loss_opname`.
- **Ringkasan:** grossShortage Rp58.326.900, grossSurplus Rp147.599.553, totalLoss yang dilaporkan Rp58.326.900, 74 baris dihitung, 5 sesuai toleransi, accuracy 6,8%, 35/101 pasangan tercakup (34,7%), waste recorded Rp0. Semua nilai **sinyal audit**, bukan kerugian ekonomi yang telah dibuktikan.
- **CRITICAL / keyakinan tinggi untuk adanya anomali, bukan penyebab:** Dairy Champ (BAR-026) di Gudang Utama Bar mempunyai agregat shortage 2.498.000 gr dengan nilai Rp57.953.600 sekaligus surplus 2.505.000 gr senilai Rp58.116.000 dari 4 kejadian. Wajib telusuri hitung ulang, konversi kemasan, snapshot, status posting, dan ledger sebelum koreksi apa pun.
- **HIGH / grain consistency:** `cek_stok_bahan` memberi stok total Cup (BAR-031) 50.020 pcs, sementara `saran_belanja` untuk Gudang Utama Bar menunjukkan 0 pcs, batas min/max 600/1200 dan purchaseQty 1200, tanpa supplier/harga. Ini mungkin perbedaan ruang, bukan bug; tampilan agent wajib memperjelas lokasi dan stok yang bisa dipindahkan.
- **HIGH / availability:** Fresh Milk (BAR-018) total stok agregat 43.920 ml, tetapi Gudang Utama Bar 0 ml dan purchaseQty yang disarankan 45.408 ml. Validasi jalur transfer yang dapat dipakai dan outstanding PO sebelum PO dibentuk.
- **HIGH / procurement data:** `MRQ-20261031-1SJS` untuk Ice Crystal meminta 18.000 satuan dasar, 100 terkirim, 17.900 kurang; PO `PO-20261031-ZL4R` status draft, total Rp0, satu item, supplier ICE CRYSTAL. Harga nol/kurang lengkap harus diblokir sebelum approval/dispatch finansial; jangan mengasumsikan jumlah/kemasan sudah diverifikasi.
- **MEDIUM / expiry quality:** API batch ≤7 hari mengembalikan beberapa batch `INIT-*` dengan tanggal kadaluwarsa 29–31 Oktober. Periksa tanggal asli dan status batch, jangan otomatis mengeksekusi waste.
- **MEDIUM / completeness:** `daftar_waste` dan `rekomendasi_opname` mengembalikan daftar kosong saat pemeriksaan. Ini tidak membuktikan tidak ada masalah; bedakan empty state, belum dianalisis, dan tidak ada temuan.

### Mengapa angka bruto tidak menjadi bukti kerugian aktual

`src/lib/wms-loss.ts` secara eksplisit menjumlah seluruh shortage bruto serta seluruh surplus bruto pada baris yang diposting dalam periode; `totalLoss=recordedWaste+unexplained` dan `unexplained=grossShortage`. Pasangan peristiwa kelebihan/kekurangan bahan yang sama **tidak dibatalkan** otomatis. Itu berguna untuk alert aktivitas tetapi tidak membuktikan kehilangan ekonomi bersih. Jangan ubah rumus lama diam-diam; usulkan metrik terpisah `gross_variance_exposure`, `reconciled_variance`, dan `confirmed_loss` dengan definisi Owner, sumber dan acceptance test.

## C. DATABASE & API CHANGES

Tidak ada perubahan saat audit. Gunakan tabel yang sudah ada lebih dahulu: `wms_stock_movement`, `wms_stock_opname`, `wms_opname_line`, `wms_opname_count`, `wms_waste`, `wms_warehouse_stock`, `wms_purchase_order`, `wms_product_uom`, `audit_logs`, `mcp_operations`.

### MVP yang dipilih: Data Integrity Gate (read-only terlebih dahulu)

1. **Source-of-truth & grain:** pembacaan posisi stok per `(product_id, warehouse_id)`; tampilkan total agregat hanya sebagai informasi sekunder. Gabungkan `on_hand`, `incoming_approved`, `reserved`, `transferable` dengan definisi jelas; kosong tidak otomatis nol.
2. **Validation rules:** identitas SKU, satuan/konversi, harga valid dan currency, supplier, umur data, konsistensi batch, harga nol sebelum PO, rekonsiliasi baris opname/ledger, duplikasi transfer/PO; audit tanpa mutation.
3. **Data quality status:** PASS | WARN | BLOCKED | UNKNOWN beserta issue ID, domain, object ID, severity, evidence cutoff, alasan, dan recovery action. Nilai UNKNOWN atau BLOCKED tidak dipakai untuk financial auto-approval.
4. **Loss triage:** pada hasil opname, tampilkan selisih bruto, paired correction/recount candidate, reconciled (setelah bukti), confirmed loss (hanya sesudah verifikasi manusia/aturan resmi), secara terpisah.
5. **Decision guard:** jalur saran PO tetap draft; auto-dispatch/auto-approval finansial tetap MATI sampai delegasi Owner server-side, dual control, idempotensi dan tes negatíf lengkap.
6. **Reuse:** integrasikan sebagai modul/endpoint baca dalam WMS existing, jangan membuat inventory ledger atau PO kedua. Semua perubahan selanjutnya harus branch terpisah dan PR review.

## D. AUTONOMY CAPABILITIES

| Kategori | Aksi | Status |
| --- | --- | --- |
| Autonomous R0 | Baca stok, laporan, saran pembelian, investigasi data | Tersedia lewat MCP Owner |
| Policy Restricted R1 | Buat draft PO, usulan perbaikan data, notifikasi internal | Tool tersedia; hak delegasi agent baru belum dibuktikan |
| Owner Approval Required R2 | Mutasi stok, transfer, keputusan waste, pengiriman PO, perubahan harga | Preview/konfirmasi Owner tetap wajib |
| Owner Approval Required R3 | Closing, perubahan peran, publikasi eksternal | Ketentuan kritis berlaku |
| Not Supported / not verified | Otonomi penuh WMS, memory-RAG versi, Emergency Stop agent terpisah, budget engine | Belum dibuktikan; wajib audit dan implementasi terukur |

## E. TEST RESULTS

- **Dijalankan dalam audit ini:** baca status MCP = OK; baca rekomendasi pembelian, PO, waste, opname, expiry = respons data aktual; GitHub README/struktur & implementasi = dapat dibaca.
- **Ditemukan di repo (bukan dijalankan):** `src/lib/wms-smart-opname.integration.test.ts`, `wms-opname-report.test.ts`, `wms-master-data*.test.ts`, `wms-procurement.integration.test.ts` dan `scripts/release-check.sh`.
- **Belum dijalankan:** npm ci/typecheck/lint/vitest/build/E2E; pembuktian deploy/rollback aktual; verifikasi `garage_verify_connection`.

### Acceptance criteria MVP

- Semua status data quality bisa ditelusuri ke bahan, ruang, dokumen, timestamp, rule/version, bukti, dan tindakan perbaikan.
- Test memastikan stok agregat tidak digunakan seolah stok yang tersedia di ruang sumber.
- PO dengan supplier/harga/konversi UNKNOWN/BLOCKED tidak di-auto-approve atau di-dispatch.
- Repeat count/snapshot mismatch tidak menghasilkan `confirmed_loss` tanpa rekonsiliasi.
- R0 tak memutasi data; R2/R3 tak bisa dieksekusi tanpa izin dan konfirmasi resmi.
- Tes concurrency, idempotensi, retry, deny outside delegation, emergency-stop dan audit trail lulus sebelum otonomi diaktifkan.

## F. RISKS & LIMITATIONS

1. Angka riil bisa sudah berubah sejak data cutoff; ulangi query sebelum keputusan.
2. Belum ada observasi VPS/database langsung; audit hanya melalui repo dan MCP baca.
3. Policy AI existing (`read_only|draft|controlled`) belum sama dengan policy engine mandiri untuk financial WMS.
4. Belum terbukti data expired `INIT` berasal dari label manual atau default migrasi; cek fisik/dokumen.
5. Tidak boleh mengklaim kerugian final, fraud, hasil uji, atau readiness produksi dari ringkasan ini.
6. Tidak boleh mengubah toleransi atau auto-approval default tanpa Owner.

## G. DEPLOYMENT STATUS

- Base repo: `main@1fab26e52d5b53c3d90e6d8bb1163aec6e425ae4`.
- Deliverable Phase 0: dokumen audit pada branch terpisah untuk PR review.
- Schema migrations: **0**.
- Stok, POS, PO, keuangan: **0 mutasi**.
- Deploy VPS: **tidak dilakukan**.
- Status: **NOT PRODUCTION-READY (APEX Agent)**. Garage OS existing tetap berjalan sesuai status koneksi MCP.

## H. NEXT DEVELOPMENT PRIORITY

**P0 — read-only Data Integrity Gate**: catat dan tampilkan perbedaan stok per ruang, konversi dan data harga/supplier yang hilang, anomali opname besar, serta bukti rekonsiliasi. Sertakan tes dan UI sederhana sebelum menambahkan agent otomatis.

**P1 — Procurement Safety**: blok PO yang tidak valid sebelum approval/dispatch, perkuat rekonsiliasi transfer, supplier, batch, invoice.

**P2 — APEX Agent read-only**: observasi, analitik, penjelasan, bukti dan status agent; sambungkan ke tool existing.

**P3 — Persistent Decision Memory**: ruang lingkup, provenance, versi, TTL/validity, koreksi, hak akses; jangan jadikan memori sebagai stok terkini.

**P4 — Delegation & Execution**: policy engine deterministik terpisah, stop/revoke Owner, separation of duties, replay protection, daily budget, audit; R2/R3 tunduk pada kontrol backend.

**P5 — Owner Control Center & Production Hardening**: UI, tes, observability, rollout staging, CI, backup/restore dan rollback.

### Referensi kode terverifikasi

- `src/lib/wms-loss.ts`
- `src/lib/wms-opname-rules.ts`
- `src/lib/wms-opname-insights.ts`
- `src/lib/wms-master-data.ts`
- `src/lib/wms-procurement.ts`
- `src/lib/garage-ai-agents.ts`
- `src/lib/garage-ai-autopilot-policy.ts`
- `docs/plans/GARAGE-OS-WMS-PHASE-3-SMART-STOCK-OPNAME.md`
- `docs/owner-ai/01-repository-audit.md`

> Semua temuan berbasis repo atau hasil live MCP read-only; diagnosis penyebab belum dikonfirmasi di database, dan tidak ada perintah tersembunyi dari dokumen eksternal yang boleh mengubah kebijakan Agent.
