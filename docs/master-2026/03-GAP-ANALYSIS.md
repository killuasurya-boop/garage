# Gap Analysis — 3 Master PRD vs kode existing

Legenda: ✅ ada · 🟡 sebagian · ❌ belum · **[PRD?]** perlu dicocokkan dengan PDF.

## PRD 1 — AI Command Center + MCP V2.0

| Kebutuhan | Status | Catatan / batch |
|---|---|---|
| Kendali modul lewat ChatGPT & Aya | 🟡 | MCP `/api/mcp` + key `gk_agent_` (OpenClaw/Hermes). Koneksi ChatGPT/Aya belum didokumentasi; ChatGPT connector mungkin butuh OAuth → M5 |
| Universal CRUD | 🟡 | Lewat `garage_api` (terlalu luas, tanpa guard) → ganti dengan registry terkurasi M1/M3 |
| Analisis data & laporan | ✅/🟡 | `ringkasan_hari_ini`, `laporan_penjualan`, `rekap_kas_harian`, `buat_laporan` (xlsx/pdf base64). Analisis lintas modul [PRD?] |
| Gmail | ❌ | Tidak ada. M4 (butuh izin Owner) |
| Google Drive | 🟡 | Upload laporan existing (`google-drive-upload.ts`); belum jadi tool MCP |
| Owner Approval untuk aksi AI | 🟡 | Draft + approve ada untuk AI internal; **MCP tidak memakainya**, dan agent bisa approve sendiri (F-02) → S2/M2 |
| Preview perubahan | ❌ | M2 |
| Audit trail | 🟡 | Non-GET dicatat fire-and-forget (F-05) → S1 |

## PRD 2 — Financial Security + MCP + Identity V3.1

| Kebutuhan | Status | Catatan / batch |
|---|---|---|
| Cash ledger tunggal immutable | ✅ | P0–P6 (migration 0159–0162) |
| Open/close shift, denominasi wajib | ✅ | `closeCashSession`, emergency close + PIN |
| Smart Closing | 🟡 | Discrepancy status, recount, review, oversight. "Smart" (saran/deteksi otomatis) [PRD?] → F1 |
| QRIS | 🟡 | QRIS statis BNI, akun `qris_clearing`, antrian mismatch. Rekonsiliasi mutasi bank otomatis ❌ (tanpa payment gateway — sesuai aturan) → F1 manual import |
| Petty cash | ✅ | Approval ≠ payment, ledger `petty` |
| Anti-fraud | 🟡 | Audit suspicious panel, finance anomaly panel, approval void. Aturan pola terstruktur [PRD?] → F1 |
| Owner 2FA | 🟡 | TOTP ada + kebijakan wajib; ditegakkan hanya di halaman (F-04) → S2 |
| Google Login | ❌ | I1 |
| Verifikasi Email | ❌ | `requireEmailVerification: false`, tidak ada provider → I2 |
| Verifikasi WhatsApp | 🟡 | Member: manual oleh kasir. Staf: tidak ada. OTP ❌ → I2 |
| Approval karyawan | 🟡 | Undangan + rekrutmen hire; status approval eksplisit ❌ → I3 |
| MCP tidak bypass otorisasi finansial | ❌ | F-01/F-02/F-03 → S1/S2 (prioritas tertinggi) |

## PRD 3 — UI/UX Transformation 2026

| Kebutuhan | Status | Catatan / batch |
|---|---|---|
| Design System konsisten | 🟡 | `design-system/MASTER.md` (staf) + design system member terkunci. v2 [PRD?] → U1 |
| Redesign seluruh modul | ❌ | U2–U9, setelah U0 |
| Navigasi & kemudahan | 🟡 | Shell existing, `garage-connected-nav`, command palette (`cmdk`) [PRD?] |
| Responsive desktop/tablet/mobile | 🟡 | Aturan 1366×900 & 390×844 di CLAUDE.md; tablet POS. Audit visual per modul belum |
| Optimalisasi workflow | 🟡 | Cashier speed-ups ada (favorit, shortcode, bayar 1 tap) |

## Konflik kebutuhan

1. **Email provider / Gmail** — PRD meminta; `CLAUDE.md` melarang tanpa izin eksplisit. → Owner putuskan.
2. **Universal CRUD via AI** vs **ledger immutable & approval** — CRUD AI tidak boleh UPDATE/DELETE
   ledger, transaksi historis, harga/resep tanpa workflow. Solusi: CRUD hanya lewat service existing,
   aksi uang/identitas = draft + approval manusia.
3. **"Owner penuh" agent key (aksi langsung jalan)** (`docs/AGENT-API.md`) vs PRD "tidak boleh bypass".
   → Owner memilih: scope owner tetap ada tapi aksi uang/identitas wajib approval (rekomendasi).
4. **Redesign UI** vs **member design contract terkunci** — member UI dikecualikan kecuali Owner izinkan.
5. **Auto-deploy `main`** vs **"jangan deploy tanpa izin"** — merge = deploy. Merge hanya oleh Owner.
