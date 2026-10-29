# 07 — Test matrix (UAT blueprint §15) — status Phase 1

`PASS` hanya dengan bukti otomatis/manual yang tercatat. `NOT TESTED` = belum ada bukti. `N/A P1` = fase lain.

| AC | Isi | Status | Bukti |
|---|---|---|---|
| AC-01 | Owner → health koneksi, tanpa secret | PASS | `GET /api/owner-ai/status` (client id dipangkas, tanpa token) — `owner-ai-connect.integration.test.ts` "tidak membocorkan client id penuh"; browser lokal 1366/375 |
| AC-02 | ChatGPT verified via one-time challenge terautentikasi; tanpa status palsu | PASS (lokal) · **NOT TESTED (ChatGPT nyata)** | `mcp-chatgpt-oauth.integration.test.ts` (OAuth asli → `garage_verify_connection`); OAuth tanpa verify tetap NEVER_VERIFIED (`owner-ai-status.test.ts`). Uji dari ChatGPT web Owner = setelah deploy |
| AC-03 | Challenge expired/replay/Owner salah ditolak | PASS | `owner-ai-connect.integration.test.ts` (expired, replay, Owner lain, kode lama, 5x salah dikunci) + OAuth replay |
| AC-04 | Token dicabut langsung ditolak | PASS | Integrasi: `touchConnection` iat ≤ revoked; OAuth ujung-ke-ujung 401 `CONNECTION_REVOKED`; refresh token ber-`revoked` |
| AC-05 | Staff/member ditolak walau peran palsu di argumen | PASS | `mcp-chatgpt-access.test.ts` (semua peran/status) + OAuth ujung-ke-ujung: token sah, peran diturunkan ke Manajer, argumen `role: Owner` → 403 OWNER_ONLY |
| AC-06 | Registrasi staf Google PENDING sampai Owner | N/A P1 | Alur `/control/access-approval` yang ada |
| AC-07 | Kapabilitas tulis yang tak didukung tampil tidak tersedia | PASS | Tool Access = UNKNOWN sampai tulis terbukti; READ_ONLY bila saklar mati (`owner-ai-status.test.ts`) |
| AC-08 | Gateway mati tidak mengganggu POS | PARTIAL | Batas paralel per Owner + timeout baca (`mcp-hardening.test.ts`); isolasi proses (ADR-002) menunggu keputusan Owner |
| AC-33 | Prompt injection tidak memicu tulis | PARTIAL (+instruksi & penanda data) | AI tidak bisa membuat kode verifikasi sendiri via `ubah_data_garage` (preview DITOLAK + eksekusi ditolak, dites); tulis R2/R3 selalu konfirmasi |
| AC-09 | Owner ubah produk/harga; baca-ulang = perubahan disetujui | PASS (harga) | `owner-ai-commands.integration.test.ts` R2 harga + browser lokal (Rp12.000 → Rp13.000, receipt) |
| AC-13 | plan/argumen berubah → commit ditolak | PASS | CONFIRMATION_ARGS_CHANGED (in-app & ChatGPT) |
| AC-14 | Persetujuan R2 sekali pakai; replay/kedaluwarsa ditolak | PASS | CONFIRMATION_USED; TTL 5 menit (mcp-confirmation) |
| AC-15 | R3 butuh step-up Garage OS, bukan teks chat | PASS | KODE_2FA_WAJIB, token tetap PENDING |
| AC-16 | Retry duplikat tidak menggandakan mutasi | PASS | token dipakai ulang ditolak, harga tetap +2.000 sekali |
| AC-18 | Aktor, sidik, operation ID terverifikasi | PARTIAL | sidik argumen & hasil + audit sebelum aksi; before/after state per entitas belum (Phase 3) |
| AC-24 | Kasus fraud memuat ID transaksi sumber, waktu, kualitas data, penjelasan lain | PASS (lewat MCP) | `agent-tools-fraud.integration.test.ts`: bukti, kelengkapan, catatan bukan-tuduhan |
| AC-25 | Retry teknis tidak otomatis menuduh karyawan | PASS (aturan B6) | `risk-rules` (tes kata menuduh dilarang) + tool hanya membaca |
| AC-29 | Laporan/hasil memuat `data_as_of` | PARTIAL | Setiap hasil MCP membawa `dataAsOf` (OAuth ujung-ke-ujung); versi metrik per laporan belum |
| AC-34 | Kegagalan berstatus terstruktur; commit tak pasti direkonsiliasi aman | PASS | `toolFailure` (kode, requestId, retryable, recovery), `UNKNOWN` di status operasi |
| AC-10…12, 17, 19–23, 26–28, 30–32, 35–36 | CRUD lain, keuangan, konektor, produksi | N/A | fase berikut |

## Tes otomatis Phase 1

| File | Jumlah | Isi |
|---|---|---|
| `src/lib/owner-ai-status.test.ts` | 7 | dimensi status, TTL, chip, gagal ≠ merah |
| `src/lib/owner-ai-connect.integration.test.ts` | 8 | kode, verify, replay/expired/lock/Owner lain, cabut + token refresh, privasi |
| `src/lib/mcp-chatgpt-oauth.integration.test.ts` | +2 | OAuth asli: ping, verify salah/benar/replay, AI tak bisa buat kode sendiri, cabut → 401 |
| `src/lib/agent-tools-ubah-data.test.ts` | +2 path | `/api/owner-ai/*` diblokir untuk chat/API key |
| `src/lib/api-route-auth.test.ts` | — | route baru terjaga guard |
| `src/lib/owner-ai-commands.integration.test.ts` | 6 | katalog, R0+audit, R2 preview→konfirmasi→receipt, argumen berubah/replay, R3 tanpa 2FA, tool tak dikenal |
| `src/lib/agent-tools-master.integration.test.ts` | 9 | supplier baru/ganda/nomor/arsip+aktif (dibaca ulang), bank tak tersentuh, bahan SKU/HPP/tanpa stok/nama ganda, Kasir ditolak |
| `src/lib/mcp-chatgpt-access.test.ts` | 8 | kebijakan akses per peran/status |
| `src/lib/mcp-hardening.test.ts` | 4 | error terstruktur + tanpa bocor detail internal, batas paralel, timeout baca saja |
| `src/lib/agent-tools-fraud.integration.test.ts` | 7 | Owner/Manajer/Kasir, filter level, detail bukti + kasus audit, hanya baca |
| `src/components/ceo/ai/schema-form.test.ts` | 3 | angka gaya Indonesia (2.5 ≠ 25), argumen form, JSON tidak valid |
