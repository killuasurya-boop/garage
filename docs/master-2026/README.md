# Garage OS — Master Implementation 2026 (handoff untuk agent berikutnya)

> **Status: PHASE 0 SELESAI · PRD V4.0 sudah di repo · menunggu persetujuan roadmap Owner.**
> Belum ada kode aplikasi yang diubah. Jangan mulai batch kode sebelum Owner menyetujui
> roadmap di `02-ROADMAP.md` (centang di bagian "Persetujuan Owner").
>
> **Baca urutan ini:** `PRD/master-2026/PRD-GOS-UNIFIED-2026-004_V4.0.md` (requirement tunggal) →
> `06-OWNER-DECISIONS.md` (keputusan Owner yang MENIMPA PRD, mis. **D-01 MCP ChatGPT full access**) →
> `07-TRACEABILITY-F01-F55.md` → `02-ROADMAP.md`.

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
| `06-OWNER-DECISIONS.md` | Keputusan Owner D-01…D-06 (mengikat, menimpa PRD) |
| `07-TRACEABILITY-F01-F55.md` | Status F01–F55: bukti di kode, gap, batch, kolom tes/PR |

## Sumber PRD

**`PRD/master-2026/PRD-GOS-UNIFIED-2026-004_V4.0.md`** — Master PRD Unified V4.0 (26 Okt 2026) yang
menggabungkan dan **menggantikan** tiga PDF (S1 AI Command Center + MCP V2.0, S2 Financial Security +
Identity V3.1, S3 UI/UX Transformation V1.0). Disalin verbatim dari Owner. PDF asli tetap di Drive Owner
dan tidak wajib ada di repo.

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
- Langkah berikutnya: Owner setujui roadmap + jawab keputusan OPEN (D-01a, D-02, D-03, D-06) →
  mulai Batch **S2** lalu **M0** (urutan di `02-ROADMAP.md`).
