# 04 — Security & threat model (Phase 0)

## 1. Kontrol yang SUDAH ada (bukti)

| Kontrol blueprint §12 | Implementasi | Bukti |
|---|---|---|
| OAuth per request, subject → Owner | `requireMcpAuth` → token Better Auth → `staff_profiles` server-side | `mcp-chatgpt-gateway.ts`, `mcp-chatgpt-access.ts` |
| Owner-only + MFA | Owner **dan** 2FA aktif wajib untuk MCP & consent | `mcpChatgptAccess` |
| Principal tidak dari argumen | Identitas dari sesi/token; argumen tool divalidasi Zod | `agent-tool-core.ts` |
| R2/R3 preview + konfirmasi terikat | Token sekali pakai (hash nonce), 5 menit, argumen harus identik, klaim atomik | `mcp-confirmation.ts` (tes) |
| R3 step-up | Tantangan TOTP terikat operation id + digest argumen, kode dipakai sekali | `step-up-totp.ts` |
| R4 ditolak | Daftar `R4_FORBIDDEN`, path terblokir, `%2e`/`%2f` ditolak | `agent-tools-ubah-data.ts` (tes) |
| Kill switch & write switch | `mcpChatgptPaused`, `mcpChatgptWriteEnabled` | settings |
| Audit sebelum aksi | Audit sinkron sebelum tool; ledger kas append-only (trigger DB) | `mcp-tool-audit.ts`, migrasi 0159 |
| Kunci delegasi sementara | Agent key sementara dicabut setelah panggilan `/api/*` | `mcp-delegated-api.ts` |
| Rate limit & guard route | Better Auth rate limit di DB; manifest guard semua route | F1 (`api-route-auth.test.ts`) |
| Header keamanan | HSTS includeSubDomains, CSP report-only, XFO | F1, smoke |

## 2. Celah (prioritas)

| # | Celah | Risiko | Rencana |
|---|---|---|---|
| S1 | Tidak ada bukti koneksi ChatGPT & tidak ada daftar koneksi aktif yang bisa dicabut dari UI | Owner tidak tahu klien mana yang memegang token; pencabutan butuh developer | Phase 1: `ai_connections`, AI Connect + revoke (step-up) |
| S2 | Receipt tanpa before/after hash; audit bukan hash-chain | Sengketa "apa yang diubah AI" sulit dibuktikan | Phase 1–2: ADR-014 |
| S3 | MCP satu proses dengan POS | Lonjakan permintaan AI memperlambat kasir | **Phase 4:** maks 4 paralel/Owner + timeout baca 25 dtk + rate limit 60/menit; isolasi container menunggu Owner |
| S4 | Prompt injection dari data (catatan produk/invoice) | AI terpancing aksi tulis | Tulis R2/R3 selalu konfirmasi Owner; **Phase 4:** instruksi server + `_meta garage/contentIsData`; AI tak bisa memverifikasi dirinya sendiri |
| S7 | Error internal (SQL/stack) terkirim ke ChatGPT | Bocor struktur DB | **Phase 4 diperbaiki:** `EXECUTION_FAILED` + ref, detail hanya di log |
| S5 | `ubah_data_garage` universal | Permukaan luas | Tetap R2/R3 + blocklist; tambah tool bertipe per domain agar universal makin jarang dipakai |
| S6 | Gmail/WA kirim belum ada | — (belum dibangun) | Wajib draft + approval + bukti provider (jujur `OPENED_FOR_SENDING`) |

## 3. Tes negatif wajib (paket §15.5) — status

| Tes | Status |
|---|---|
| Token tanpa/invalid/expired → 401 | ADA (`mcp-chatgpt-oauth.integration.test.ts`) |
| Owner tanpa 2FA ditolak (403) | ADA |
| Peran non-Owner (Manajer/Kasir) dengan token sah ditolak | ADA (Phase 3: unit + OAuth peran diturunkan) |
| Kill switch 503, saklar write menolak tool ubah | ADA |
| Replay token konfirmasi, argumen berubah | ADA (`mcp-confirmation.test.ts`) |
| Path traversal/terenkode di ubah data | ADA |
| Verify challenge brute force / replay / salah Owner | ADA (Phase 1) |
| Revoke koneksi → permintaan baru ditolak | ADA (Phase 1) |
| Prompt injection dari data | **BELUM** |
| Gateway mati → POS tetap jalan | **BELUM** (butuh isolasi / uji beban) |
