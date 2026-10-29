# 05 — Kontrak API & tool (Phase 1)

## API internal (sesi Owner di layar Garage OS; API key/agent selalu 403)

| Method | Path | Isi | Catatan |
|---|---|---|---|
| GET | `/api/owner-ai/status` | `{ status, connections[], dataAsOf, mcpUrl, mcpPath, settings{paused, writeEnabled} }` | `cache-control: no-store`; client id hanya 6 karakter terakhir |
| POST | `/api/owner-ai/connection/challenge` | `{ challengeId, code: "XXXX-XXXX", expiresAt }` | Kode hanya di respons ini; 10/10 menit per Owner; audit tanpa kode |
| POST | `/api/owner-ai/connections/revoke` | body `{ connectionId?, alasan, kode2fa }` → `{ revokedCount, connectionIds }` | Kosong = cabut semua; kode TOTP wajib; audit dengan alasan |

`status` = keluaran `computeAiStatus` (`src/lib/owner-ai-status.ts`):

| Dimensi | Nilai | Bukti |
|---|---|---|
| `gateway` | ONLINE · PAUSED · OFFLINE | Konfigurasi `GARAGE_MCP_CHATGPT_ENABLED` + HTTPS, setting `mcpChatgptPaused` |
| `identity` | VERIFIED · NEEDS_2FA | `user.two_factor_enabled` Owner |
| `link` | VERIFIED · NEEDS_REVERIFY · NEVER_VERIFIED · REVOKED | `ai_connections.last_verified_at` dalam TTL 24 jam |
| `toolAccess` | READ_WRITE · READ_ONLY · BLOCKED · UNKNOWN | Tulis/baca yang benar-benar berhasil dari ChatGPT (preview tidak dihitung) |
| `execution` | IDLE · RUNNING · FAILED | `mcp_operations` terakhir (confirmed ≤ 2 menit = RUNNING) |
| `chip` | AI_VERIFIED · AI_STANDBY · AI_RUNNING · AI_ERROR · AI_NOT_SETUP | Merah hanya untuk koneksi/identitas |

## Tool MCP baru

| Tool | Risk | Input | Output | Kesalahan |
|---|---|---|---|---|
| `garage_ping` | R0 | — | `status, server, serverTime, akun, peran, jalur` | — |
| `garage_verify_connection` | R0 | `kode` (8–12 karakter, pemisah bebas) | `verified, connectionId, verifiedAt, pesan` | `CAPABILITY_UNAVAILABLE` (bukan jalur ChatGPT), `CHALLENGE_NOT_FOUND`, `CHALLENGE_EXPIRED`, `INVALID_CODE` (sisa percobaan), `CHALLENGE_LOCKED`, `CONNECTION_REVOKED` |

Verify tetap jalan walau saklar "ChatGPT boleh mengubah data" mati (hanya menulis metadata bukti, bukan data bisnis).

## Gateway `/api/mcp/chatgpt` (perubahan)

- Setiap token sah → `ai_connections` (owner + client OAuth) dicatat/diperbarui.
- Token dengan `iat` ≤ `revoked_at` koneksi → **401 `CONNECTION_REVOKED`** (JWT stateless tidak bisa ditarik; ini pencabutan seketika).
- Token yang terbit setelah pencabutan (Owner login + 2FA ulang lewat OAuth) → koneksi aktif lagi, status verified direset.
- Tool sukses → `last_read_ok_at` / `last_write_ok_at`; respons preview `PERLU_KONFIRMASI` tidak dihitung tulis.
- `/api/owner-ai/*` masuk `isAgentForbiddenPath`: `ubah_data_garage`/`garage_api`/API key tidak bisa membuat kode atau mencabut koneksi.

## Data (migrasi 0175, additive)

`ai_connections` (unik owner+provider+client) · `ai_verification_challenges` (hash `sha256("ai-verify:<owner>:<kode>")`,
status active/verified/expired/locked/superseded, attempts, TTL). Reset grand opening: `ai_connections` KEEP, tantangan CLEAR.
