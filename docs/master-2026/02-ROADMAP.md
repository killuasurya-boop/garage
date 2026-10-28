# Master Implementation Roadmap 2026 (selaras PRD V4.0 §29 + keputusan Owner)

Sumber: `PRD/master-2026/PRD-GOS-UNIFIED-2026-004_V4.0.md` · keputusan `06-OWNER-DECISIONS.md` ·
fitur `07-TRACEABILITY-F01-F55.md`.

Prinsip urutan (PRD §29): **ketepatan uang dulu** → identitas → kontrol kasir/manajer/Owner →
design system → laporan/risiko → MCP/Aya → modul growth. MCP Owner (D-01) boleh berjalan paralel
setelah fondasi keamanan gateway (M0) karena memakai service yang sama dengan UI.

Aturan batch: 1 batch = 1 branch `claude/<id>-<slug>` dari `main` terbaru = 1 draft PR. Migration
additive saja. **Jangan merge** (merge `main` = auto-deploy produksi). Status: `READY` · `BLOCKED` · `DONE`.

## Dependency map

```
Fase 0  S0 Audit (DONE) ─────────────────────────────────────────────────────────┐
                                                                                  ▼
Fase 1  B1 Payment state & business_date ─► B2 Open-shift policy + Cash In/Out + PARKIR + stock purchase
              │                                     │
              ▼                                     ▼
        B3 Tender guard + QRIS paid/settled + Quick Retail
                                                    │
Fase 2  I1 Google OAuth ─► I2 Email+WA OTP ─► I3 Staff application + Access Approval Center
              (S2 2FA di API = prasyarat I3 & B4)
                                                    │
Fase 3  B4 Closing state machine: double blind recount, custody (D-03), submit≠final, Owner final + TOTP
                                                    │
Fase 4  U0 Ekstraksi modul ─► U1 Design system (D-02) ─► U2 Shell/nav ─► U3 POS/Shift/Closing/Approval/KDS
                                                    │
Fase 5  B6 Risk LV1–LV5 + Case ─► B7 Owner 360, monthly ledger, 4 PDF, Reports Studio ─► M4 Drive/Gmail
                                                    │
Fase 6  M0 OAuth gateway + audit sync ─► M1 Registry ─► M2 Preview/confirm/receipt ─► M3 Full tools Owner (D-01) ─► M5 Aya
        (M0–M3 boleh mulai setelah S2; tidak menunggu Fase 1–5)
                                                    │
Fase 7  U4–U9 modul growth · R1 staging · R2 release plan · restore drill · Owner go/no-go
```

## Batch

### Fase 0 — Audit & containment
| ID | Batch | Isi | Status |
|---|---|---|---|
| S0 | Audit read-only + dokumen handoff | `docs/master-2026/*`, PRD V4.0 di repo | **DONE** |
| S0b | Screen/route census | Daftar ±111 halaman & ±594 route → peta ke screen registry PRD §25.1 + screenshot 1366/1024/390 (PRD §29 Fase 0, F55) | agent kedua (klaim di #80) |

### Keamanan dasar (prasyarat semua fase)
| ID | Batch | Isi | Status |
|---|---|---|---|
| S1 | Agent key hardening | Audit agent SINKRON (tulis + baca data keuangan), audit gagal → 503; key statis tidak bisa `/api/admin/users`, `/api/admin/security`, pengaturan `security*`/`mcpChatgpt*` (kill switch) | **PR #84 (draft)**; F-06 → **PR #101** (migration 0165); audit per-tool `/api/mcp` → **PR #106** |
| S2 | 2FA wajib di API | Wajib 2FA Owner/Manajer ditegakkan di `requireGarageSession` untuk `/api/*` (F-04), tes negatif. **Dipindah ke S1/M0:** helper `requireOwnerPrincipal` (Owner manusia atau Owner via OAuth MCP) | **PR #81 (draft, menunggu review Owner)** |

### Fase 1 — Financial integrity (PRD §08–§11)
| ID | Batch | Fitur | Status |
|---|---|---|---|
| B1 | Business date (cut-off 04:00, D-08) | Fondasi `business-date.ts`, buku kas, `reports/*`, `sales-report`, `cash-oversight`, `event-sales-report`; setting belum tampil di UI | **PR #87 (draft)** — payment state PENDING/PAID via provider tetap BLOCKED (QRIS statis, D-06 butir 3) |
| B1b | Business date — sisa modul uang + aktivasi | `finance-control` (laba-rugi, `wibDay` SQL), `finance-closing` (+ kunci hari closed), laporan Owner, dashboard/ringkasan "hari ini", preset klien "Hari ini/Kemarin"; lalu tampilkan field di Pengaturan | **PR #88 (draft, base #87)** |
| B2 | Open Shift policy + parkir + cash-out bahan | F02/F27 policy_versions + acceptance; F06/F31 deklarasi parkir per outlet+business_date; F08 tautan purchase_id; AC-F01–F07, F16 | BLOCKED (D-06 butir 1: tanggal efektif & label setoran) |
| B3 | Tender guard, QRIS paid/settled, Quick Retail | F28, F05 (import rekap merchant karena QRIS statis), F32, F34; AC-F08–F15, F17 | tender guard + Quick Retail + ref QRIS → **PR #93 (agent kedua)**; status PAID dari provider tetap BLOCKED (D-06 butir 3) |

### Fase 2 — Identity & access (PRD §06)
| ID | Batch | Fitur | Status |
|---|---|---|---|
| I1 | Google OAuth staf + adapter member terisolasi | F41, F46; link by provider subject, tanpa auto-role (AC-I03) | BLOCKED (Google OAuth Client) |
| I2 | Verifikasi email + WhatsApp OTP | F42, F43, F47; hash OTP, TTL 5m, 5 percobaan, cooldown 60s (AC-I01/02/08/09) | BLOCKED (D-04, D-05) |
| I3 | Staff application + Owner Access Approval Center | F44, F45; `staff_access_requests`, semua API staf 403 saat pending (AC-I04–I07) | **PR #108 (draft, base #101; migration 0166)** — tanpa verifikasi email/WA otomatis (menunggu I1/I2) |

### Fase 3 — Kontrol kasir/manajer & Owner final (PRD §10.8, §12, §13)
| ID | Batch | Fitur | Status |
|---|---|---|---|
| B4 | Closing state machine | F13, F14, F18, F39, F10, F09/F17 (D-03); pisah submit kasir vs Owner final, TOTP fresh terikat hash+nonce, STALE recount, concurrent lock (AC-F18–F31) | **DONE (bagian READY, migration 0167)**: hitung ulang #2 blind + #3, hitungan append-only, final Owner + TOTP terikat hash/nonce, STALE, lock konkuren. Custody/brankas (F09/F17) tetap BLOCKED (D-03) |

### Fase 4 — Design system & core UX (PRD §23–§25)
| ID | Batch | Isi | Status |
|---|---|---|---|
| U0 | Ekstraksi modul tanpa ubah perilaku | Pecah `garage-app.tsx` (±10.300 baris) per modul + baseline visual | **U0a–U0e DONE** (pos-view.tsx 12.840 → 9352 baris; dialog Cek Meja + label status dipindah) |
| U1 | Design system v2 | Token, komponen registry, state wajib (§24.8), WCAG 2.2 AA, **komponen `AyaAvatar` + ekspresi status (D-07)** | READY (D-02 FINAL: gelap semua; aset Aya D-07 sudah ada) |
| U2 | Shell & navigasi | Sitemap Owner §23.4, nav per device §23.5, command palette berizin | setelah U1 |
| U3 | Redesign P0 | POS-02, SHF-01, SHF-04, FIN-03, FIN-07, SYS-01, DSH-01, AI-01, WMS-04 (§25.3) | setelah U2 + B2–B4 |

### Fase 5 — Analytics, risk & reports (PRD §14, §16, §20, §21)
| ID | Batch | Fitur | Status |
|---|---|---|---|
| B6 | Risk engine & case | F11, F16, F20, F21, F23, F36, F12 (liability tanpa potong otomatis) | **DONE v1** (migration 0169): `risk-rules.ts` (12 aturan explainable LV1–LV5, custody §14.5, pembanding shift) + `risk-engine.ts` (dedupe, disposisi manusia tidak ditimpa, Manajer ≠ subjek, kesimpulan akhir Owner, eskalasi ke audit_cases) + panel Alert Risiko |
| B7 | Owner 360 & laporan | F15, F19, F22, F25, F35, F37, F38; 4 PDF penamaan §20.2, hash/versi | **B7a DONE** (migration 0168): snapshot final append-only + PDF shift resmi §20.2 (DRAFT, hash, versi, nama file). Sisa: PDF harian/bulanan/kasus, Owner 360, ledger bulanan |
| M4 | Drive & Gmail | F53, F24; file/message ID terverifikasi | BLOCKED (D-04) |

### Fase 6 — MCP Gateway & Aya (PRD §22 + D-01 FULL ACCESS Owner)
| ID | Batch | Isi | Status |
|---|---|---|---|
| M0 | OAuth gateway `/api/mcp/chatgpt` | OAuth 2.1 (`@better-auth/mcp`), discovery, token 15 m/refresh 7 h, kill switch `mcpChatgptPaused`, Owner+2FA only, audit sinkron, mati default (`GARAGE_MCP_CHATGPT_ENABLED`) | **MERGED ke main (dc57846, 26 Okt, disetujui Owner)** bersama #82/#85/#86 — **deploy BELUM jalan** (GitHub Actions tanpa runner/billing); aktif setelah deploy + `GARAGE_MCP_CHATGPT_ENABLED=true` |
| M1 | Module/tool registry | F48; 16 domain + risiko R0–R3 per tool (wajib, dijaga tes), daftar R4, `kemampuan_sistem`, label risiko di `tools/list` | **MERGED (dc57846)** |
| M2 | Preview → konfirmasi → receipt | F49, F51; `mcp-confirmation.ts`, tabel `mcp_operations` (0164), token sekali pakai 5 m (klaim UPDATE atomik), argumen harus sama, `status_operasi`, `preview()` per tool. Hanya `/api/mcp/chatgpt`; key statis belum. D-01a (TOTP utk R3) belum diterapkan | **MERGED (dc57846)** |
| M3 | **Full tool coverage Owner** | Semua aksi R0–R3 Owner di 16 domain via tool bisnis (termasuk finance: approve cash-out, petty pay, setoran, final closing, void/refund, harga, role); R4 tetap ditolak; `garage_api` dipensiunkan setelah coverage lengkap | stack draft: M3a #89 → M3b #91 → M3c #92 → M3d #94 → M3e #100 → M3f #103 → M3g #105 — **16/16 domain punya tool**; `garage_api` di jalur API key belum dipensiunkan (butuh keputusan Owner) |
| M5 | **Aya in-app (peliharaan Owner, D-07)** | F52; asisten AI bernama & berwajah Aya: avatar/ilustrasi dari foto asli, ekspresi per state, persona di `garage-ai-persona.ts`, suara TTS, motion ringan; backend & policy identik dengan MCP (D-01) | identitas Aya untuk Owner (in-app + MCP) → **PR #109 (draft)**; avatar/aset BLOCKED (D-07a–c); sapaan/nada (D-07d) & Aya untuk staf (D-07e) OPEN; UI menunggu #96 (U0a) |

### Fase 7 — Growth, hardening, rollout
| ID | Batch | Isi | Status |
|---|---|---|---|
| U4–U9 | Redesign modul growth | Produk/HPP, WMS, KDS, CRM/member (kontrak member terkunci), HR, event, marketing, meja/QR | setelah U3 |
| R1 | Staging terisolasi | VPS/DB terpisah atau Neon branch, data disamarkan | **SIAP PASANG** (`docker-compose.staging.yml`, `scripts/deploy-staging.sh`, `docs/STAGING.md`; diuji simulasi lokal) — menunggu DNS `staging` + deploy produksi |
| R2 | Release plan | Backup verify + `cashLedgerFingerprint` + restore drill + rollback `garage-app:previous`; deploy dijalankan Owner | BLOCKED |

## Urutan kerja rekomendasi untuk agent berikutnya

1. ~~S2~~ (PR #81) → 2. ~~M0~~ (PR #82, #83) → ~~S1~~ (PR #84) → ~~M1~~ (PR #85) → ~~M2~~ (PR #86) → ~~B1~~ (PR #87) → **B1b** (OAuth gateway, karena D-01 adalah prioritas Owner) →
3. **S1** (persempit key non-Owner) → 4. **B1** → 5. **I3** → 6. **U0** / **S0b** paralel →
7. **M1 → M2 → M3** → lalu Fase 1–5 sisanya sesuai jawaban keputusan OPEN.

## Persetujuan Owner

- [ ] Roadmap disetujui — tanggal: ______ (centang lewat komentar PR)
