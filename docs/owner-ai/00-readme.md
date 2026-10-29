# Owner AI Command Center & MCP Connect — folder bukti implementasi

> **Sumber requirement:** Blueprint `GOS-AI-MCP-IMPLEMENTATION-003` V3.0 (29 Okt 2026, dari Owner; file asli di
> Drive Owner `CODING/Garage_OS_Owner_AI_Command_Center_MCP_Implementation_Blueprint_V3.md`, tidak disalin ke repo).
> **Status saat ini:** `PHASE 1 (PR #145) + PHASE 2 KODE SELESAI, BELUM DEPLOY` — AI Connect + AI Command Center in-app
> (mesin perintah yang sama dengan ChatGPT: preview → setuju (+2FA R3) → receipt bersidik, timeline operasi).
> Uji dari ChatGPT web nyata: **NOT TESTED** (butuh deploy + paket ChatGPT Owner). Phase 0 audit: selesai.
> **Branch:** `feature/garage-owner-ai-command-center` (dari `origin/main` `b89f458`).

Folder ini melanjutkan, **bukan menggantikan**, `docs/master-2026/` (PRD V4.0, keputusan Owner D-01…D-08, traceability
F01–F55). Bila blueprint V3 berkonflik dengan keputusan Owner yang sudah tercatat (mis. D-01 ChatGPT full access, D-01b
hapus/arsip tanpa 2FA), keputusan Owner yang tercatat menang sampai Owner memutuskan lain — konflik dicatat sebagai ADR.

## Isi

| File | Isi | Status |
|---|---|---|
| `00-readme.md` | Ringkasan, status, rencana fase berikut | ✅ |
| `01-repository-audit.md` | Baseline nyata + gap matrix blueprint (EXISTING / PARTIAL / MISSING / BLOCKED) dengan path bukti | ✅ |
| `02-architecture-adrs.md` | ADR-001…012 blueprint: keputusan atas kondisi repo nyata | ✅ (OPEN ditandai) |
| `03-module-registry.md` | 16 domain × 67 tool nyata (risk R0–R3) + gap per domain | ✅ |
| `04-security-threat-model.md` | Kontrol keamanan yang sudah ada vs §12 blueprint, celah, prioritas | ✅ |
| `05-apis-and-tool-contracts.md` | API Owner AI, tool `garage_ping`/`garage_verify_connection`, perubahan gateway, data | ✅ Phase 1 |
| `06-owner-guide-id.md` | Panduan Owner (sambung, verifikasi, arti chip, darurat) | ✅ Phase 1 |
| `07-test-matrix.md` | Status AC-01…08 + daftar tes | ✅ Phase 1 |
| `08-deployment-checklist.md` | Urutan merge, deploy, cek Owner sesudah deploy | ✅ |
| `09-rollback-and-recovery.md` | Rollback | `08`–`11` | Deploy, rollback, UAT sign-off, release report | ⏳ saat rilis | darurat | ✅ |
| `10`–`11` | UAT sign-off, release report | ⏳ setelah deploy + uji ChatGPT nyata |

## Aturan yang berlaku (ringkas)

- Tidak ada deploy/restart/migrasi produksi tanpa perintah Owner; deploy hanya dari laptop (`release-check.sh` → `deploy-manual.sh`).
- Tidak ada raw SQL/shell/hapus ledger/audit lewat AI (R4, sudah ditegakkan `R4_FORBIDDEN`).
- Tidak ada status palsu: `CHATGPT VERIFIED` hanya setelah tool call terautentikasi dari ChatGPT benar-benar tercatat.
- Laporan tiap fase: `DONE / PARTIAL / BLOCKED / NOT TESTED` + SHA + bukti tes.

## Ringkasan temuan Phase 0

1. **Fondasi MCP sudah kuat:** OAuth 2.1 (`@better-auth/mcp`) aktif di produksi (metadata publik 200, panggilan tanpa token 401
   + `WWW-Authenticate` benar), Owner + 2FA only, 67 tool di 16 domain dengan risk R0–R3, R2/R3 preview + token sekali pakai,
   R3 butuh kode 2FA, audit sinkron sebelum tool, kill switch & saklar write.
2. **Celah terbesar terhadap blueprint:**
   - **Connection Center tidak ada** (AI-01/02): tidak ada halaman status/wizard, tidak ada `garage_verify_connection` / challenge,
     tidak ada indikator navbar. Owner tidak bisa melihat apakah ChatGPT benar-benar tersambung.
   - **Dua mesin AI terpisah:** Aya in-app (`/api/ai/pos-agent`, `ai_action_drafts`) ≠ mesin 67 tool MCP. Blueprint ADR-001 = satu mesin.
   - **Receipt operasi belum lengkap:** `mcp_operations` mencatat preview/konfirmasi/eksekusi, tetapi tanpa before/after hash,
     tanpa tool `garage_get_operation`, tanpa audit hash-chain.
   - **Gateway tidak terisolasi:** MCP berjalan di proses Next.js yang sama dengan POS (ADR-002 meminta isolasi).
3. **Domain tipis:** Bar/Kitchen (1 tool baca), Dokumen (1), Notifikasi (1 tulis), Dashboard (2 baca). Supplier/bahan master belum
   punya tool tulis bertipe (hanya lewat `ubah_data_garage` universal).

## Rencana fase berikut (usulan — menunggu persetujuan Owner)

**Phase 1 (P0, tanpa infrastruktur baru, tanpa migrasi destruktif):**

| Tiket | Isi | Bukti selesai |
|---|---|---|
| GAI-006 | `ai_connections` + `ai_verification_challenges` (migrasi additive), tool MCP `garage_ping`, `garage_verify_connection` (kode sekali pakai, hash, TTL, maks percobaan, terikat Owner) | Tes replay/expired/salah Owner/brute force |
| GAI-006 | Status teragregasi terpisah: Gateway · Identity · ChatGPT Link · Tool Access · Execution (`GET /api/owner-ai/status`) | Tes status tidak pernah "VERIFIED" tanpa receipt |
| GAI-007 | Halaman **AI Connect** `/control/ai-connect`: tiles status, salin URL MCP, wizard 5 langkah, buat kode verifikasi, last verified, saklar Pause/Write (pakai setting yang ada), cabut koneksi (step-up) + chip navbar `AI VERIFIED/STANDBY/ERROR/NOT SETUP` | E2E desktop 1366 + mobile 390 |
| GAI-004 | Receipt operasi: `garage_get_operation`, before/after hash pada eksekusi R2/R3, kode error machine-readable (§6.4) | Tes integrasi receipt |

**Phase 2–3 (setelah Phase 1 lulus):** Owner AI Command Center in-app memakai **mesin tool yang sama** (preview → approval → execute →
receipt) menggantikan jalur draft Aya untuk aksi bisnis; Audit Timeline; tool bertipe supplier/bahan; Fraud Watch UI disatukan dengan
`risk_alerts` yang sudah ada.

**Butuh keputusan Owner (BLOCKED sampai dijawab):** isolasi gateway (container terpisah = ubah docker-compose/Caddy produksi),
subdomain `mcp.garagecoffee.id` vs path sekarang `/api/mcp/chatgpt`, paket ChatGPT Owner (Business/Enterprise untuk write penuh),
Gmail (akun & scope).
