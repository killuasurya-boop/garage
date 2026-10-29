# 01 — Repository audit & baseline (Phase 0, GAI-001)

Tanggal: 30 Okt 2026 · Metode: baca kode + uji publik read-only. **Tidak ada** perubahan produksi, DB atau secret.

## 1. Baseline nyata

| Item | Nilai | Bukti |
|---|---|---|
| Repo | `killuasurya-boop/garage`, single-app Next.js (bukan monorepo) | `git remote`, `package.json` |
| Commit dasar | `b89f458` (merge #144 WMS smart opname) | `git log -1 origin/main` |
| Runtime | Next.js 16.4.3 (App Router, standalone), Node 22 di image (`node:22-bookworm-slim`), laptop Node 24 | `Dockerfile`, `npx next --version` |
| DB | PostgreSQL 16 (produksi), PGlite (dev/tes), Drizzle; migrasi terakhir `0174_wms_smart_opname` | `drizzle/` |
| Auth | Better Auth 1.7.12 (+ `@better-auth/mcp` 1.7.12, `jwt`, 2FA TOTP); peran Garage di `staff_profiles` | `src/lib/auth.ts` |
| Deploy | Manual dari laptop: `release-check.sh` → `deploy-manual.sh` (build laptop, kirim image, backup, migrate, smoke, rollback). GitHub Actions billing rusak | `docs/DEPLOY_MANUAL.md` |
| Layanan VPS | `app`, `db`, `caddy`, `backup`, `migrate` (docker compose) + cron `vps-monitor.sh` | `docker-compose.yml` |
| Health | `/api/health` (publik minimal), smoke 13 cek | `scripts/smoke-prod.sh` |
| MCP produksi | **AKTIF**: `/.well-known/oauth-protected-resource` 200 (`scopes_supported: garage:owner`), metadata AS 200, `POST /api/mcp/chatgpt` tanpa token = 401 + `WWW-Authenticate` benar | `curl` 30 Okt 2026 |
| ChatGPT pernah terverifikasi? | **NOT VERIFIED** — tidak ada mekanisme verifikasi; jumlah klien OAuth/token produksi tidak diperiksa (butuh izin baca DB produksi) | — |
| Protokol MCP | JSON-RPC ditulis sendiri, versi `2025-06-18` (terima 2024-11-05/2025-03-26); **tanpa** `@modelcontextprotocol/*` SDK | `src/lib/agent-mcp.ts` |
| Staging | Siap di kode (`docker-compose.staging.yml`) — **BLOCKED** DNS `staging` belum diarahkan | `docs/STAGING.md` |
| Backup | Harian + pre-deploy, tarik offsite terenkripsi GPG (kunci Owner belum dibuat), restore drill LULUS 29 Okt | `scripts/` |

## 2. Gap matrix — Scope wajib blueprint §1.2

| Level | Deliverable | Status | Bukti / catatan |
|---|---|---|---|
| P0 | Registry 16 domain | **EXISTING** | `GARAGE_DOMAINS` + `buildCapabilities` (`mcp-tool-registry.ts`), tes memaksa domain+risk per tool; 67 tool (lihat 03) |
| P0 | Connection Center (status terpisah, wizard, verify) | **MISSING** | Tidak ada halaman/endpoint status koneksi; hanya setting `mcpChatgptPaused`, `mcpChatgptWriteEnabled` |
| P0 | Identity + Owner policy | **EXISTING** | Owner + 2FA only (`mcpChatgptAccess`), principal dari token server-side (bukan argumen tool), step-up TOTP (`step-up-totp.ts`) |
| P0 | Read + analytics berbukti & cutoff | **PARTIAL** | Tool R0 penjualan/kas/stok + laporan Owner resmi (`owner-reports*.ts`, `UNAVAILABLE_METRICS`); belum ada `data_as_of` seragam di output tool |
| P0 | Safe CRUD produk/harga/supplier/bahan/kategori | **PARTIAL** | Tool: `ubah_harga_varian` R2, `aksi_produk` R2, `ubah_status_menu` R1; supplier/bahan/kategori WMS ada sebagai API bertipe (`wms-master-data.ts`) tapi belum sebagai tool; sisanya lewat `ubah_data_garage` universal |
| P0 | POS closing & fraud checks | **EXISTING** (kas/QRIS/setoran/petty) · **MISSING** parkir | B4/B6/B7 (`cash-final-approval.ts`, `risk-rules.ts`, `owner-reports.ts`); parkir menunggu D-06 |
| P0 | Audit & rollback (receipt, tamper-evident, idempotency) | **PARTIAL** | `mcp_operations` (preview→token→confirm→execute/failed, `UNKNOWN` bila terkonfirmasi tanpa hasil), `audit_logs` sinkron sebelum tool; **tidak ada** before/after hash, hash-chain, `garage_get_operation` |
| P1 | WMS full workflow | **EXISTING (UI/API)** · **PARTIAL (tool)** | Minta Bahan, PO+WA+PDF (`wms-procurement.ts`), receiving, smart opname; tool AI: 13 (9 baca) |
| P1 | HR, CRM, KDS, meja, event, konten | **PARTIAL** | Tool tipis untuk KDS (1), HR (2) |
| P1 | Reports & Google connectors | **PARTIAL** | PDF/XLSX ada; Google Drive OAuth ada (`/api/ai/drive/oauth/*`); **Gmail MISSING** |
| P2 | Automations & advanced fraud | **PARTIAL** | Job AI (shift copilot, system doctor, master report), risk engine; baseline musiman belum |

## 3. Gap matrix — Screen registry §3.3

| Screen | Status | Bukti |
|---|---|---|
| AI-01 Connection Overview | MISSING | — |
| AI-02 Setup Wizard | MISSING | — |
| AI-03 Tool Registry | PARTIAL | Tool `kemampuan_sistem` (via chat); tidak ada halaman |
| AI-04 Owner Chat | PARTIAL | Modul `ai-agent` (`ai-pos-agent-view.tsx`, `/api/ai/pos-agent`) — **mesin terpisah** dari 67 tool |
| AI-05 Action Diff | PARTIAL | Preview R2/R3 hanya di ChatGPT (`mcp-confirmation.ts`); in-app tidak ada |
| AI-06 Approval Center | PARTIAL | `/api/ai/actions` (draft Aya) + `approvals` (void dll.) — tidak menyatu dengan `mcp_operations` |
| AI-07 Audit Timeline | PARTIAL | `/api/audit` + audit log umum; belum per operasi AI |
| AI-08 Fraud Watch | EXISTING | `RiskAlertsPanel`, `/control/risk`, `audit_cases` |
| AI-09 Finance Reconciliation | EXISTING | `CashOversightPanel`, `OwnerDossierPanel`, buku kas B7c |
| AI-10 Reports Studio | PARTIAL | Laporan Owner resmi + `buat_laporan`; belum riwayat run |
| AI-11 Integrations | PARTIAL | Drive OAuth; Gmail/WA API tidak |
| AI-12 AI Settings | PARTIAL | Setting pause/write + provider AI; belum threshold risiko per domain |

## 4. TBD blueprint §0.2 — jawaban dari repo

| Pertanyaan | Jawaban | Status |
|---|---|---|
| Repository & baseline | Bagian 1 | DONE |
| Database & tenant/outlet | Single tenant, multi-outlet (`outlets`, `staff_profiles.outlet_id`) | DONE |
| OAuth/OIDC provider | Better Auth MCP plugin (teruji, bukan buatan sendiri) | DONE |
| ChatGPT dapat memasang/write MCP? | Tidak bisa dibuktikan dari repo — butuh uji Owner di ChatGPT web | **BLOCKED (Owner)** |
| Versi protokol vs host | Server `2025-06-18`; blueprint menyebut spec 2026-07-28 — jangan dinaikkan tanpa uji host | OPEN (ADR-008) |
| Staging/backup | Backup + restore drill OK; staging menunggu DNS | PARTIAL |
| Google Drive/Gmail | Drive OAuth ada; Gmail tidak | PARTIAL |
| Rumus kas & costing | Buku kas tunggal + moving average (CLAUDE.md, tes) | DONE (tidak diubah) |

## 5. Regresi yang wajib dijaga (sudah punya tes)

Harga order lama tidak berubah saat harga produk berubah (snapshot `order_items`), harga event ≠ reguler (`event-menu-service.ts`),
harga beli baru tidak menulis ulang HPP historis (moving average + snapshot), pembayaran bank tidak mengurangi laci (`cash-sources.ts`).
