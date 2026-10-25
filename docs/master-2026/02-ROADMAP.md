# Master Implementation Roadmap 2026

Prinsip urutan: **uang & identitas dulu → AI/MCP di atas fondasi aman → UI/UX terakhir per modul.**
Alasan: MCP yang lebih kuat tanpa guard memperbesar F-01/F-02; redesign UI tanpa ekstraksi modul
memperbesar F-10. Setiap batch = 1 branch `claude/<id>-<slug>` + 1 draft PR, kecil, bisa di-revert.

Status: `READY` (boleh dikerjakan setelah Owner setuju) · `BLOCKED` (butuh keputusan/izin) · `DONE`.

## Dependency map

```
            ┌──────────── S0 Guardrail repo/CI ────────────┐
            ▼                                              ▼
 S1 Agent/MCP hardening ──► S2 Human-only & 2FA API ──► F1 Financial gap closing
            │                       │                          │
            ▼                       ▼                          ▼
 M1 MCP tool registry ─────► M2 Preview+Owner Approval ──► M3 Universal CRUD (terkurasi)
            │                                                  │
            ▼                                                  ▼
 M4 Gmail/Drive/Laporan ◄────────── I1 Google Login ◄──── I2 Verifikasi Email/WA ─► I3 Approval karyawan
                                                               
 U0 Ekstraksi modul (garage-app/garage-service) ──► U1 Design System v2 ──► U2..U9 redesign per modul
 (U0 boleh paralel dengan S*/F*, tetapi file finance hanya disentuh oleh satu batch pada satu waktu)

 R1 Staging terisolasi (butuh izin Owner) ──► R2 Release plan + backup verify + rollback
```

## Batch

### Fondasi (PHASE 1–2)

| ID | Batch | Isi | Migration? | Status |
|---|---|---|---|---|
| S0 | Guardrail repo | `docs/master-2026/*` (batch ini). Usulan ke Owner: branch protection `main`, required reviewer environment `production`, hapus registrasi workflow WMS yatim. Tidak mengubah `deploy.yml` tanpa izin. | Tidak | **DONE (dok)** |
| S1 | Agent/MCP hardening (F-01, F-05, F-06) | Ganti denylist `garage_api` jadi **allowlist** per scope; tutup `/api/admin/*`, `/api/control/cash-opening`, `/api/approvals/*` decide, `/api/ai/actions/*/approve`, pengaturan keamanan, user/role; audit agent sinkron (gagal audit = gagal request) + audit GET finansial; rate limit persisten (tabel/DB) | Mungkin (tabel rate limit/audit agent, additive) | READY |
| S2 | Human-only & 2FA di API (F-02, F-03, F-04) | Helper `requireHumanSession` diterapkan ke semua keputusan uang/identitas (approval, void, revert, review closing, petty pay, setoran confirm, sertifikasi saldo, user/role, settings keamanan); cek 2FA wajib di `requireGarageSession` untuk Owner/Manajer; test per route | Tidak | READY |
| F1 | Financial gap closing [PRD?] | Cocokkan PRD V3.1 vs P0–P6: Smart Closing, rekonsiliasi QRIS (mutasi bank vs `qris_clearing`), anti-fraud rules (pola void/refund/diskon, kas keluar berulang), notifikasi Owner. Hanya menambah, tidak mengubah ledger existing | Additive | BLOCKED (butuh PDF V3.1) |

### Identitas (PHASE 2)

| ID | Batch | Isi | Status |
|---|---|---|---|
| I1 | Google Login staf/Owner | Better Auth `socialProviders.google`, link ke akun existing via email terverifikasi, **tidak** auto-membuat staff profile; Owner tetap wajib 2FA | BLOCKED (Owner: Client ID Google, setuju OAuth login) |
| I2 | Verifikasi Email & WhatsApp | Email: butuh provider (CLAUDE.md melarang tanpa izin) → keputusan Owner. WA: OTP via WhatsApp Cloud API queue existing (template OTP harus disetujui Meta) | BLOCKED (Owner: pilih provider email, template WA) |
| I3 | Approval karyawan | Pendaftaran staf baru `status = pending_approval` → Owner approve (human-only, 2FA), audit; reuse undangan & rekrutmen hire | READY setelah S2 |

### MCP & AI (PHASE 3)

| ID | Batch | Isi | Status |
|---|---|---|---|
| M1 | Registry tool MCP | Satu registry tool terkurasi (reuse `ai_action_registry` + `agent-tools.ts`), metadata: modul, risk level (read/low/money/identity), butuh approval? | READY setelah S1 |
| M2 | Preview + Owner Approval | Tool tulis berisiko → buat **draft** (reuse AI action drafts) berisi preview diff before/after; eksekusi hanya setelah Owner approve di UI (human-only). Idempotency key per draft | READY setelah M1+S2 |
| M3 | Universal CRUD terkurasi | CRUD lewat MCP per modul via service existing (bukan SQL langsung), selalu lewat validasi Zod + aturan bisnis yang sama dengan UI. Ledger/riwayat tetap immutable | READY setelah M2 |
| M4 | Gmail, Drive, laporan | Drive existing dipakai untuk laporan; Gmail kirim laporan (scope `gmail.send` saja) — butuh izin Owner (ini "email provider") | BLOCKED (Owner) |
| M5 | Aya / ChatGPT connector | Dokumentasi koneksi ChatGPT (MCP remote) & Aya; OAuth MCP bila connector ChatGPT mensyaratkan [PRD?] | BLOCKED (PDF + akun) |

### UI/UX (PHASE 4)

| ID | Batch | Isi | Status |
|---|---|---|---|
| U0 | Ekstraksi modul | Pecah `garage-app.tsx` per modul (tanpa ubah perilaku), snapshot test/visual baseline sebelum-sesudah | READY |
| U1 | Design System v2 [PRD?] | Perluas `design-system/MASTER.md` (token, komponen, navigasi, density) — member UI tetap terkunci | BLOCKED (PDF UI/UX) |
| U2–U9 | Redesign per modul | Urutan usulan: Navigasi/shell → POS → Kasir closing → Kitchen → Finance/Control → WMS → CRM/Member admin → Approvals/Audit → Dashboard/AI Command Center. Tiap modul: 1366×900, 1024 tablet, 390×844, reduced-motion | Setelah U1 |

### Testing, staging, rilis (PHASE 5–7)

| ID | Batch | Isi | Status |
|---|---|---|---|
| T* | Per batch | tsc, lint, vitest PGlite, build, security test (route agent/human/2FA), regresi | Wajib tiap batch |
| R1 | Staging terisolasi | VPS/DB terpisah atau Neon branch; data dari backup yang disamarkan; **bukan** container produksi | BLOCKED (izin Owner) |
| R2 | Release plan | Backup verify (restore drill `docs/DEPLOY_VPS.md`, `cashLedgerFingerprint` sebelum/sesudah), rollback (`garage-app:previous`), jadwal di luar jam operasional — deploy dijalankan Owner | BLOCKED |

## Keputusan yang dibutuhkan dari Owner

1. Setujui urutan di atas (terutama S1/S2 sebelum MCP diperluas).
2. Upload 3 PDF PRD (atau teks) ke `PRD/master-2026/`.
3. Email provider untuk verifikasi & Gmail: boleh? (melanggar default CLAUDE.md bila tanpa izin).
4. Google OAuth Client untuk login (domain `garagecoffee.id`).
5. Template OTP WhatsApp di Meta.
6. Aktifkan branch protection `main` + required reviewer environment `production` (di GitHub Settings).
7. Izin staging terpisah (R1).

## Persetujuan Owner

- [ ] Roadmap disetujui — tanggal: ______ (Owner centang lewat PR/komentar)
