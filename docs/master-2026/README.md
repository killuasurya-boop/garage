# Garage OS — Master Implementation 2026 (handoff untuk agent berikutnya)

> **Status: PHASE 0 (audit read-only) SELESAI — menunggu persetujuan Owner.**
> Belum ada kode aplikasi yang diubah. Jangan mulai PHASE 1 sebelum Owner menyetujui
> roadmap di `02-ROADMAP.md` (centang di bagian "Persetujuan Owner").

Folder ini adalah sumber kebenaran untuk pekerjaan besar "Garage OS Master Implementation 2026"
yang menggabungkan 3 Master PRD. Agent mana pun yang melanjutkan **wajib** membaca file ini dulu,
lalu update `05-PROGRESS-LOG.md` di setiap batch.

## Isi folder

| File | Isi |
|---|---|
| `README.md` | Aturan mutlak, cara melanjutkan, status terkini |
| `01-AUDIT-PHASE0.md` | Hasil audit read-only: inventaris fitur existing + temuan |
| `02-ROADMAP.md` | Master roadmap, urutan batch, dependency map, persetujuan Owner |
| `03-GAP-ANALYSIS.md` | Gap per PRD (ada / sebagian / belum) + konflik kebutuhan |
| `04-SECURITY-CHECKLIST.md` | Checklist keamanan finansial, identitas, MCP, VPS/GitHub |
| `05-PROGRESS-LOG.md` | Log per batch (format wajib output setiap batch) |

## Sumber PRD

Tiga PDF Master PRD milik Owner berada di Google Drive lokal Owner
(`J:\My Drive\CODING\…`) dan **tidak ikut ke repo / container cloud**:

1. `Garage_OS_Master_PRD_AI_Command_Center_MCP_2026.pdf` — AI Command Center + MCP V2.0
2. `GARAGE_TEBING_TINGGI_MASTER_PRD_FINANCIAL_SECURITY_MCP_IDENTITY_V3_1_2026.pdf` — Financial Security + MCP + Identity V3.1
3. `Garage_OS_MASTER_PRD_UI_UX_Transformation_2026.pdf` — UI/UX Transformation 2026

Audit PHASE 0 disusun dari **ringkasan PRD di instruksi Owner** + kode repo. Isi detail PDF
(angka, alur layar, acceptance criteria) **belum terverifikasi**. Langkah pertama yang disarankan:
Owner menaruh salinan PDF (atau ekspor teks/markdown-nya) di `PRD/master-2026/` agar agent
berikutnya bisa mencocokkan gap analysis baris per baris. Semua butir yang bergantung pada detail
PDF ditandai **[PRD?]**.

## Aturan mutlak (dari Owner — tidak boleh dilanggar agent mana pun)

- ZERO restart / reload / stop / reboot / rebuild / redeploy service produksi.
- Jangan ubah konfigurasi VPS, Nginx/Caddy, Docker, PM2, firewall, DNS, port, env produksi.
- Jangan jalankan migration atau query mutasi di database produksi.
- Jangan hapus/ubah transaksi historis, ledger, produk, harga, resep, stok, akun tanpa workflow resmi.
- Jangan force push, reset, rewrite history, atau hapus branch utama.
- Jangan bocorkan credentials / secrets / token / `.env`.
- **Jangan merge ke `main`** — `main` = auto-deploy produksi (lihat di bawah). Merge hanya oleh Owner.
- Bila suatu langkah berpotensi mengganggu server: STOP, laporkan risiko, tunggu Owner.

## Fakta deployment yang WAJIB diketahui (hasil audit)

- `.github/workflows/deploy.yml` → **setiap push ke `main` = build + SSH ke VPS + backup + migrate +
  `docker compose up` (restart app)**. Artinya merge PR = deploy produksi + migration otomatis.
- `.github/workflows/ci.yml` → jalan pada `pull_request` dan push ke `main` saja: typecheck, lint,
  vitest (PGlite). **Push ke branch `claude/*` tidak memicu workflow apa pun**; membuka PR hanya memicu CI.
- Workflow `WMS browser UAT` & `WMS PostgreSQL concurrency` masih terdaftar aktif di GitHub tetapi
  file-nya sudah tidak ada di `main` (tidak akan berjalan).
- `deploy.sh` / `update-vps.sh` di repo dijalankan manual di VPS — **agent tidak boleh menjalankannya**.
- Konsekuensi: setiap batch yang menambah migration (`drizzle/0163_*` dst.) akan dieksekusi otomatis
  saat Owner merge. Migration harus additive, backward-compatible, dan diuji di PGlite + staging dulu.

## Cara melanjutkan (untuk agent berikutnya)

1. Baca `CLAUDE.md` (aturan domain, sangat detail — khususnya Buku kas tunggal P0–P6), `AGENTS.md`,
   `design-system/MASTER.md`, lalu semua file di folder ini.
2. Cek `05-PROGRESS-LOG.md` → ambil batch berikutnya yang statusnya `READY` di `02-ROADMAP.md`.
3. Kerjakan di branch fitur baru `claude/<batch-id>-<slug>` dari `main` terbaru. Satu batch = satu PR.
4. Verifikasi per batch: `npx tsc --noEmit -p .` (NODE_OPTIONS=--max-old-space-size=6144),
   `npm run lint`, `npx vitest run` (GARAGE_DB_DRIVER=pglite), `npm run build`, `npm run db:generate`
   bila schema berubah. Untuk UI: cek 1366×900 & 390×844.
5. Buka PR (draft) ke `main` untuk review Owner. **Jangan merge.** Tulis laporan batch di
   `05-PROGRESS-LOG.md` dengan format wajib.

## Status saat ini

- Branch audit: `claude/jolly-darwin-irvynl` (dibuat dari `main` @ `89d4318`).
- Kode aplikasi: **tidak berubah**. Hanya dokumentasi di `docs/master-2026/`.
- Risiko VPS/DB dari batch ini: **nol** (dokumentasi; tidak ada migration, tidak ada deploy).
- Langkah berikutnya: Owner review & setujui roadmap → mulai Batch **S1** (hardening MCP/agent key,
  temuan keamanan kritis F-01…F-03).
