# 07 — Test matrix (UAT blueprint §15) — status Phase 1

`PASS` hanya dengan bukti otomatis/manual yang tercatat. `NOT TESTED` = belum ada bukti. `N/A P1` = fase lain.

| AC | Isi | Status | Bukti |
|---|---|---|---|
| AC-01 | Owner → health koneksi, tanpa secret | PASS | `GET /api/owner-ai/status` (client id dipangkas, tanpa token) — `owner-ai-connect.integration.test.ts` "tidak membocorkan client id penuh"; browser lokal 1366/375 |
| AC-02 | ChatGPT verified via one-time challenge terautentikasi; tanpa status palsu | PASS (lokal) · **NOT TESTED (ChatGPT nyata)** | `mcp-chatgpt-oauth.integration.test.ts` (OAuth asli → `garage_verify_connection`); OAuth tanpa verify tetap NEVER_VERIFIED (`owner-ai-status.test.ts`). Uji dari ChatGPT web Owner = setelah deploy |
| AC-03 | Challenge expired/replay/Owner salah ditolak | PASS | `owner-ai-connect.integration.test.ts` (expired, replay, Owner lain, kode lama, 5x salah dikunci) + OAuth replay |
| AC-04 | Token dicabut langsung ditolak | PASS | Integrasi: `touchConnection` iat ≤ revoked; OAuth ujung-ke-ujung 401 `CONNECTION_REVOKED`; refresh token ber-`revoked` |
| AC-05 | Staff/member ditolak walau peran palsu di argumen | PARTIAL | Principal dari token server-side (tidak ada argumen peran); Owner tanpa 2FA 403 dites; peran Manajer/Kasir via OAuth belum dites khusus |
| AC-06 | Registrasi staf Google PENDING sampai Owner | N/A P1 | Alur `/control/access-approval` yang ada |
| AC-07 | Kapabilitas tulis yang tak didukung tampil tidak tersedia | PASS | Tool Access = UNKNOWN sampai tulis terbukti; READ_ONLY bila saklar mati (`owner-ai-status.test.ts`) |
| AC-08 | Gateway mati tidak mengganggu POS | NOT TESTED | Gateway masih satu proses (ADR-002 OPEN) |
| AC-33 | Prompt injection tidak memicu tulis | PARTIAL | AI tidak bisa membuat kode verifikasi sendiri via `ubah_data_garage` (preview DITOLAK + eksekusi ditolak, dites); tulis R2/R3 selalu konfirmasi |
| AC-09…32, 34–36 | CRUD, keuangan, laporan, konektor, produksi | N/A P1 | Phase 2+ |

## Tes otomatis Phase 1

| File | Jumlah | Isi |
|---|---|---|
| `src/lib/owner-ai-status.test.ts` | 7 | dimensi status, TTL, chip, gagal ≠ merah |
| `src/lib/owner-ai-connect.integration.test.ts` | 8 | kode, verify, replay/expired/lock/Owner lain, cabut + token refresh, privasi |
| `src/lib/mcp-chatgpt-oauth.integration.test.ts` | +2 | OAuth asli: ping, verify salah/benar/replay, AI tak bisa buat kode sendiri, cabut → 401 |
| `src/lib/agent-tools-ubah-data.test.ts` | +2 path | `/api/owner-ai/*` diblokir untuk chat/API key |
| `src/lib/api-route-auth.test.ts` | — | 3 route baru terjaga guard |
