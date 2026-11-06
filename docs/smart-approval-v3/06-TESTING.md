# Smart Approval V3 — 06 Testing

Status per 6 Nov 2026 (branch `ccr-29608758-dtli1n`). Angka di bawah dari run nyata `rc.sh` / release check,
bukan perkiraan.

## Ringkasan run
| Pemeriksaan | Hasil |
|---|---|
| Katalog API (`generate-api-catalog.ts`) | OK |
| Lockfile `npm@10 ci --dry-run` | OK |
| `npm audit --omit=dev --audit-level=high` | OK |
| `tsc --noEmit` | OK |
| `npm run lint` | OK |
| Vitest (unit + integrasi PGlite) | 274 file, **1825 lulus** / 1825 |
| `next build` | OK |
| Playwright E2E | Run release check: server uji masuk loop reload di `/login` (7 gagal, timeout isi form login, juga saat diulang). Run penuh berikutnya: **12 lulus / 12**, 0 kompilasi ulang. |

## Tes khusus Smart Approval
**Unit `src/lib/smart-approval.test.ts` (5)** — tier R1–R3, `bulkDecisionBlockReason`, `autoApprovalDecision`
(risiko, pemohon ≠ penyapu, batas 3/hari), `canDecideForOutlet`, `parseRupiahLabel`.

**Integrasi `src/lib/smart-approval.integration.test.ts` (8, PGlite)**
1. Berhasil: status `approved` + `execution_status = succeeded` + sidik tersimpan.
2. Gagal dijalankan: kembali Menunggu, `failed` + pesan aman + audit "Pelaksanaan keputusan gagal".
3. STALE: data order berubah sejak preview → keputusan ditolak (409).
4. Keputusan bersamaan: hanya satu yang lolos.
5. Manajer outlet A tidak bisa memutus pengajuan outlet B; Owner bisa; daftar & statistik Manajer tersaring.
6. Bulk setuju menolak R3/void/refund di server.
7. Auto-sweep melewati risiko tinggi, pemohon sendiri, dan kuota harian.
8. Tunda / Minta revisi: catatan wajib, status tetap Menunggu.

**Integrasi `src/lib/decision-center.integration.test.ts` (5)**
1. Bukan Owner / agent key ditolak.
2. Detail A–J dari data nyata; void order yang sudah batal → rekomendasi Tolak.
3. R3 tanpa kode 2FA ditolak (Owner tanpa 2FA → `TOTP_NOT_ENABLED`).
4. Non-R3: STALE bila data berubah; setujui dengan sidik baru → disetujui + pelaksanaan tercatat; KPI ikut.
5. Tunda wajib catatan.

**E2E `e2e/decision-center.spec.ts`** — Owner menolak pengajuan diskon dengan alasan; pengajuan R3 meminta 2FA.

## Regresi yang ikut dijalankan
`critical-flows` (login, POS tunai/QRIS, tutup shift + setoran, PDF/Excel Owner, scroll Kelola Staff),
`pos-guardian`, `pos-pending`, `pos-v6-theme`, `aya-solver`.

## Catatan lingkungan uji
Server E2E (`e2e/start-server.mjs`) memakai PGlite baru per run. `GARAGE_E2E_SERVER=1` mematikan
`experimental.mcpServer` Next hanya di server uji. Loop reload `/login` masih bisa muncul sesekali di server uji (bukan bug aplikasi; terlihat dari ratusan "Compiled in" tanpa perubahan kode). Bila terjadi, ulangi E2E; penyebab pastinya belum ditemukan (bukan `mcpServer`, bukan sisa `next build`, bukan `.next/dev/types`).
