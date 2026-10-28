# Traceability F01–F55 — PRD V4.0 ↔ kode existing ↔ batch

Status kode (audit read-only `main` @ `89d4318`): ✅ ada · 🟡 sebagian · ❌ belum.
Status "ada" = ditemukan di source, **belum** diverifikasi di production/staging (PRD §00.4).
Batch = ID di `02-ROADMAP.md`. Agent yang menyelesaikan fitur: ubah status + isi kolom Tes/PR.

## Keuangan F01–F40

| F | Fitur (PRD) | Status | Bukti di kode / gap | Batch | Tes / PR |
|---|---|---|---|---|---|
| F01 | Identitas kasir & outlet (§10.1, §10.9) | 🟡 | `cash_sessions` opener/closer, `actor` di audit; gate `ACTIVE_STAFF` dari approval staf belum ada | B1, B5 | |
| F02 | Open Shift warning (§10.1) | ❌ | Tidak ada modal peringatan + `policy_acceptances` berversi | B2 | |
| F03 | Cash counting pecahan (§10.2) | ✅ | `opening_denominations`, `cash-denominations.ts`, `cash-denomination-grid.tsx`; pecahan wajib saat closing (0161) | — | regresi |
| F04 | Balancing bertahap (§10.3) | 🟡 | Ledger + closing ada; tanggal operasional cut-off (PR #87, D-08); checkpoint mid-shift/pre-close ❌ | B1, B2, B4 | `business-date*.test.ts` |
| F05 | QRIS reconciliation (§11) | 🟡 | QRIS statis BNI, akun `qris_clearing`, antrian mismatch (oversight); status provider PAID/SETTLED & import rekap merchant ❌ | B3 | |
| F06 | Setoran harian Rp10.000 (§10.7) | ❌ | Hanya kategori biaya "Transportasi/Parkir" (`cash-drawer.ts`) — bukan deklarasi parkir harian | B2 | |
| F07 | Cash In/Out & petty (§10.4–10.5) | ✅ | `recordCashMovement`, kategori `cash-drawer.ts`, petty ledger (0160) | — | regresi |
| F08 | Pembelian stok internal (§10.6) | 🟡 | `recordCashPurchases`, WMS receiving, Minta Bahan; tautan `purchase_id` di cash-out laci belum tegas | B2 | |
| F09 | Deposit manajer (§12.1) | ✅ | D-03 FINAL: setoran laci → `deposit_transit` → bank, dikonfirmasi penerima ≠ penyetor + nomor bukti bank (`confirmCashDeposit`); tanpa custody manajer/brankas | B4 | |
| F10 | Close Shift warning (§10.8) | 🟡 | Closing wajib pecahan, blind count server (`cash-blind.ts`); teks peringatan & wizard 9 langkah ❌ | B4, U3 | |
| F11 | Review & investigasi (§14.4) | 🟢 | Disposisi alert (OPEN/FALSE_POSITIVE/EXPLAINED/SUBSTANTIATED/DISPUTED/CLOSED) + catatan, eskalasi ke `audit_cases`, PDF kasus `CASE-XXXXXXXX` (B6/B7b) | B6 | |
| F12 | Payroll liability review (§15) | 🟡 | Kasbon `staff_cash_advances`; liability case + review HR ❌ | B6 | |
| F13 | Owner approval + 2FA (§13.3) | 🟢 | Final Owner per shift + TOTP terikat hash ringkasan & nonce sekali pakai, STALE bila data berubah (`cash-final-approval.ts`, B4); snapshot append-only (B7a) | B4 | |
| F14 | Daily finance approval (§13.4) | 🟢 | Owner 360 date-first (`OwnerDossierPanel`): semua shift satu tanggal, custody, selisih, risiko, timeline + PDF closing harian (B7b) | B4 | |
| F15 | PDF/Excel lengkap (§20.2) | 🟢 | 4 jenis PDF resmi §20.2: A shift (B7a), B closing, C financial audit, D case (`owner-reports-pdf.ts`); penamaan + hash/versi/report ID; watermark DRAFT sampai final | B7 | |
| F16 | Risk monitoring (§14) | 🟢 | Risk engine B6: 12 aturan explainable, pindai otomatis setelah tutup/verifikasi/final, panel Alert Risiko | B6 | |
| F17 | Manager float pecahan (§12.3) | ✅ | Tidak dipakai — D-03 FINAL: tidak ada float/custody manajer (setoran langsung ke bank) | B4 | |
| F18 | Mandatory double recount (§10.8) | 🟢 | Hitung ulang #2 blind wajib, #1≠#2 per pecahan → #3; semua hitungan append-only (`cash_session_counts`, B4) | B4 | |
| F19 | Owner Approval 360 (§13.5) | 🟢 | Owner 360 (`OwnerDossierPanel`, Kontrol Kas): strip, summary, custody map, penjelasan selisih, risiko, timeline, kasus, konteks bulanan; keputusan final per shift di Riwayat Shift (2FA) | B7 | |
| F20 | Fraud risk LV1–LV5 (§14.1) | 🟢 | LV1–LV5 = prioritas pemeriksaan (`risk-rules.ts`), bahasa netral dijaga tes (B6) | B6 | |
| F21 | Dual-party investigation (§14.5–14.7) | 🟢 | Pemeriksa ≠ pembuka/penutup shift; Manajer tidak memeriksa alert tentang dirinya; insiden diselesaikan bukan oleh pelapor | B6 | |
| F22 | Monthly shortage ledger (§16.1) | 🟢 | `getMonthlyLedger`: kurang/lebih tidak dinetkan per hari/kasir/pemeriksa, frekuensi & rasio relatif; confirmed loss/recovered ditandai belum tercatat | B7 | |
| F23 | Exact event timeline (§16.2) | 🟡 | Ledger punya waktu; field occurred/recorded/detected/reviewed/confirmed terpisah ❌ | B6 | |
| F24 | Automatic finance summary (§21) | 🟡 | `garage-ai-report.ts`, shift copilot; format facts/unknowns/evidence ❌ | M4 | |
| F25 | PDF audit 360 (§20.2) | 🟢 | PDF D kasus (`CASE_<ID>`): kronologi, bukti alert, shift terkait, catatan, keputusan | B7 | |
| F26 | Control & QA hardening (§27–28) | 🟡 | `closing-audit-probe`, suite cash-*; pemantau VPS + peringatan Owner (`vps-monitor.sh`); ASVS mapping ❌ | S1+ | |
| F27 | Open warning discipline (§10.1) | ❌ | | B2 | |
| F28 | Tender guard CASH/QRIS (§09.2) | 🟡 | `correctPaymentMethod`, `paymentStatusOf`; QRIS PENDING≠PAID oleh provider ❌ (QRIS statis: verifikasi manual kasir) | B3 | |
| F29 | Cash-out belanja bahan (§10.4) | ✅ | Kategori drawer + `expenses` (0144) | — | regresi |
| F30 | External transfer excluded (§08.3) | ✅ | `cashSource = external` tidak diposting (`cash-sources.ts`) | — | regresi |
| F31 | Parking mandatory close (§10.7) | ❌ | | B2 | |
| F32 | Quick Retail Sale (§09.3) | 🟢 | Penjualan Langsung (`saleChannel: quick_retail`, tender guard, idempotency) + kartu bergambar/Favorit/Uang pas (#121, merged 29 Okt, belum deploy) | B3 | |
| F33 | New retail SKU management (§09.3) | ✅ | Product management, SKU/barcode unik (`assertUniqueProductCodes`) | — | regresi |
| F34 | Customer payment proof (§09.1) | 🟡 | Receipt + QR invoice; `payment_reference` QRIS ❌ | B3 | |
| F35 | Owner decision cashflow (§13.5) | 🟢 | Owner 360: custody map + arus kas per akun (saldo awal/masuk/keluar/akhir, cek DB) + arus pihak luar non-laci per jenis (`cash-ledger-report.ts`) | B7 | |
| F36 | Risk cashier & manager (§14.2) | 🟢 | Custody scope per alert: kasir / manajer / QRIS / bank / sistem (§14.5) — alert QRIS & bank bukan tanggungan kasir | B6 | |
| F37 | Monthly cashier accountability (§16.1) | 🟢 | Ledger bulanan per kasir (PDF C + panel konteks bulanan) | B7 | |
| F38 | PDF detailed cash ledger (§20.2) | 🟢 | Buku kas rinci PDF + Excel (`type=ledger`): per akun saldo berjalan, ID stabil (id+seq), pembalik dua arah, data lama ditandai, rekonsiliasi saldo DB | B7 | |
| F39 | Recount & immutable proof (§10.8) | 🟢 | Hitungan & buku kas append-only (trigger); final Owner STALE bila ringkasan berubah setelah dihitung; koreksi = baris pembalik | B4 | |
| F40 | Payment-to-closing QA gates (§28.1) | 🟡 | `scripts/release-check.sh` (gate main gabungan) + `smoke-prod.sh` pasca-deploy + `restore-drill.sh` (29 Okt); CI GitHub Actions masih mati (billing) | semua | |

## Identitas, MCP, UX F41–F55

| F | Fitur | Status | Bukti / gap | Batch | Tes / PR |
|---|---|---|---|---|---|
| F41 | Google OAuth staf & member | ❌ | Google OAuth hanya untuk Drive/YouTube/Business; `auth.ts` tanpa `socialProviders` | I1 | |
| F42 | Verifikasi email oleh Garage OS | ❌ | `requireEmailVerification: false`; butuh D-04 | I2 | |
| F43 | WhatsApp OTP | ❌ | Member: verifikasi manual kasir (`wa_verified_at`); queue WA ada; butuh D-05 | I2 | |
| F44 | Staff application PENDING_OWNER_APPROVAL | ❌ | Undangan + rekrutmen hire ada; `staff_access_requests` ❌ | I3 | |
| F45 | Owner Access Approval Center + MFA | ❌ | | I3 | |
| F46 | Safe account linking & migrasi member lama | ❌ | | I1 | |
| F47 | Re-verifikasi ganti kontak | ❌ | | I2 | |
| F48 | Module Registry | 🟡 | **PR #85**: `mcp-tool-registry.ts` (16 domain, R0–R4, peta kemampuan + domain belum ada tool), tool `kemampuan_sistem`. Belum: UI Module Registry di Owner Control Center | M1 | `mcp-tool-registry.test.ts` |
| F49 | Lifecycle perintah + operation receipt | 🟢 | Preview → konfirmasi → eksekusi → receipt + `status_operasi`; R3 wajib `kode2fa` (D-01a) | M2 | `mcp-chatgpt-oauth.integration.test.ts` (M2), `mcp-confirmation.test.ts` |
| F50 | MCP OAuth gateway | 🟢 | OAuth 2.1 `/api/mcp/chatgpt` aktif di produksi (27 Okt), dites Owner di ChatGPT | M0 | `mcp-chatgpt-oauth.integration.test.ts`, `mcp-chatgpt-config.test.ts` |
| F51 | MCP write (preview/konfirmasi/commit) | 🟢 | Tool bisnis 16/16 domain (M3) + `ubah_data_garage` universal (#121): perubahan uang = R3 + kode 2FA, path ter-encode ditolak | M2, M3 | — |
| F52 | Aya in-app Owner Copilot | 🟡 | `owner-chat`, AI agents, provider OpenAI/Gemini; nama "Aya" belum ada di kode. **D-07: Aya = peliharaan Owner** (nama, avatar, persona) | M5, U1 | |
| F53 | Reports Studio + Drive/Gmail | 🟡 | Drive upload ✅, Gmail ❌ (D-04) | M4 | |
| F54 | Design system & component registry | 🟡 | `design-system/MASTER.md`, shadcn/ui; token PRD §24.2 konflik → D-02 | U1 | |
| F55 | Workspace per role & screen registry 16 modul | 🟡 | ±111 halaman; census + screenshot ❌ | U0 | |
