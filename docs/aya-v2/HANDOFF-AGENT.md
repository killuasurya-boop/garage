# AYA V2 — Handoff untuk agent Claude Code berikutnya

Baca berurutan: [OWNER-DECISIONS.md](OWNER-DECISIONS.md) (**mengalahkan spec bila bertentangan**) → [START_HERE.md](START_HERE.md) → [AYA_V2_MASTER_SPEC_CLAUDE_CODE.md](AYA_V2_MASTER_SPEC_CLAUDE_CODE.md) (requirement utama, §23 = prompt eksekusi) → [PHASE-0-AUDIT.md](PHASE-0-AUDIT.md) (kondisi kode nyata) → [design-kit/README_Claude_Code.md](design-kit/README_Claude_Code.md).
Catatan: §23 menyebut `AYA_V2_Claude_Code_Design_Kit.zip`; di repo isinya sudah diekstrak ke folder [design-kit/](design-kit/).

## Aturan Owner (tidak bisa ditawar)
- Kerjakan di branch fitur + PR. **Jangan merge ke main, deploy, atau migrasi produksi tanpa persetujuan Owner tertulis di chat.**
- Jangan ubah harga POS atau data keuangan historis. DB produksi hanya boleh dibaca (read-only).
- Jangan klaim lulus tanpa output tes nyata. Laporan per tahap: `SELESAI` / `KENDALA` / `REKOMENDASI` / `STATUS` (Implemented / Verified / Blocked) + file berubah + tes + hasil.
- Jangan aktifkan layanan berbayar (OpenAI volume besar, ElevenLabs, STT server) tanpa izin Owner.
- Satu PR = satu tahap yang bisa diverifikasi. Migrasi drizzle: cek nomor terakhir di `drizzle/` main **dan** PR terbuka (PR #159 memakai `0177`) supaya tidak tabrakan.

## Blocker yang menunggu keputusan Owner
Semua blocker sudah diputuskan Owner: [OD-01](OWNER-DECISIONS.md), [OD-02](OWNER-DECISIONS.md), [OD-03](OWNER-DECISIONS.md) (mode Rp 0 — fitur Aya V2 tanpa biaya API; budget OpenAI default Rp 0 = mati).
Sudah diputuskan: [OD-01](OWNER-DECISIONS.md) customer **tetap memesan** di `/order`, Aya memandu dan menunjuk tombol (jangan ubah alur checkout); [OD-02](OWNER-DECISIONS.md) karakter V2 **menggantikan** V1 di semua layar.

## Pekerjaan yang sudah bisa jalan tanpa menunggu blocker
| Urutan | Branch saran | Isi | Gate |
|---|---|---|---|
| A | `feat/aya-v2-mascot` | Komponen `AyaMascot` + 8 state dari `design-kit/assets/` (salin ke `public/garage-brand/aya/v2/`), state machine, reduced-motion, mute; **ganti V1 di semua titik pemasangan** sesuai OD-02 (adapter props lama boleh) | Snapshot 8 state, 3 breakpoint, keyboard focus, tidak menutupi POS/KDS |
| B | `feat/aya-v2-tool-gateway` | Aya in-app memakai `runAgentTool` (registry yang sama dengan ChatGPT MCP) via function calling OpenAI; filter tool per peran; R2/R3 via `mcp-confirmation`; budget guard yang memblokir, **default Rp 0 = mati (OD-03)**, fallback FAQ/aturan | Tes role leakage, customer tak bisa baca data internal, R2 tanpa konfirmasi ditolak, budget habis, prompt injection |
| C | `feat/aya-v2-release-registry` | Tabel rilis (migrasi aditif), versi/commit di `/api/health`, endpoint ber-secret yang dipanggil `deploy-manual.sh` **setelah smoke test lulus**, notifikasi Owner, What's New per divisi + acknowledgment | build ≠ deployed ≠ verified; rollback tercatat; tidak bocor ke customer |
| A2 | `feat/aya-v2-order-guide` (setelah A) | Di `/order`: Aya menjelaskan cara pesan langkah demi langkah sesuai alur aktual (pilih menu → keranjang → checkout → bukti bayar) dan pada state `guiding` **menunjuk dengan tangan + menyorot tombol** yang sedang dibahas (anchor `data-aya-anchor` pada tombol tambah item, keranjang, checkout, upload bukti bayar). Aya tidak menekan tombol/isi pembayaran; tidak menunjuk checkout bila outlet tutup (`/api/customer/ordering-status`) | Kriteria OD-01: anchor tepat di 3 breakpoint, overlay tidak menangkap klik, hilang saat ditutup/diklik, reduced-motion statis, E2E alur pesan `/order` tetap lulus |
| A3, A4 | lihat [PLAN-ANIMASI-SUARA-SCROLL.md](PLAN-ANIMASI-SUARA-SCROLL.md) | Rig animasi (kedip, tangan menunjuk, efek lucu), scroll memandu, bicara bijak-lucu-imut (Web Speech), SFX ZzFX — semua Rp 0 | Lihat gate di dokumen rencana |
| D | setelah PR #159 di-merge | Smart Action Center: kategori (Operational/Payment/Inventory/System/Deployment/New Feature/Security/Owner Attention), dedupe, cooldown, eskalasi | Matriks audio lintas departemen, notifikasi penting tidak tertutup pengumuman fitur |

## Jebakan operasional yang sudah ditemukan (4 Nov 2026)
- Checkout utama `C:\Users\killu\Music\GARAGEFIX\G A R A G E` sering berisi perubahan sesi lain (branch `perf/deploy-ringan`). **Jangan disentuh; pakai `git worktree add` di path tanpa spasi.** E2E gagal di path berspasi (`e2e/start-server.mjs` tidak decode URL).
- Jangan jalankan full vitest/build/release-check bersamaan dengan sesi lain di laptop yang sama (timeout).
- `release-check.sh` harus dijalankan di clone bersih `C:\Users\killu\Music\GARAGEFIX\garage-release-main` pada branch `main` = `origin/main`.
- Build butuh `BETTER_AUTH_SECRET`; pakai placeholder yang sama dengan Dockerfile: `export BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime` (bukan secret asli).
- `release-check.sh` meregenerasi `src/lib/api-route-catalog.generated.ts`; di Windows bisa jadi CRLF sehingga `deploy-manual.sh` menolak "perubahan lokal". Cek `git diff --ignore-cr-at-eol --quiet`, lalu `git checkout -- src/lib/api-route-catalog.generated.ts`.
- Setiap route API baru wajib diikuti `npx tsx scripts/generate-api-catalog.ts` dan commit katalognya.
- `node_modules` di checkout utama bisa basi; untuk tes cepat di worktree, `npm ci` atau junction ke `garage-release-main/node_modules` (hanya bila `package.json`/lock identik).
- CI GitHub Actions tidak jalan (billing akun). Sampai Owner membereskan billing, bukti tes = output lokal.
- Docker Desktop harus dinyalakan sebelum `deploy-manual.sh`.
