---
name: hemat-token
description: Cara kerja hemat token di repo Garage OS (Claude Code). Pakai di awal tugas apa pun yang menyentuh banyak file, file besar (garage-service.ts, garage-app.tsx, garage-data.ts, schema.ts), log/test panjang, build output, atau saat user minta "hemat token", "jangan boros", "cepat saja". Berisi aturan baca file sebagian, pencarian terarah, output perintah dipotong, dan kapan TIDAK memakai subagent/MCP.
---

# Hemat Token — Garage OS

Tujuan: hasil sama, konteks sekecil mungkin. Setiap byte yang masuk konteks dibayar
lagi di setiap giliran berikutnya, jadi yang paling mahal adalah **output besar yang
masuk sekali lalu terbawa terus**.

## 0. Muat hanya skill modul yang tersentuh
- `CLAUDE.md` sengaja ringkas; aturan detail ada di skill modul (`garage-pos`, `garage-kas`, …, tabel
  indeks di `CLAUDE.md`). Muat skill modul yang tugasnya sentuh — WAJIB, jangan dilewati demi hemat.
- Jangan muat skill modul yang tidak tersentuh. Skill panjang (`garage-kas`, `garage-produk-wms`,
  `garage-partner-hub`): baca utuh bila mengubah logika uang/stok; untuk tugas sempit cukup Grep judul
  bagiannya lalu baca bagian itu.
- Aturan baru Owner ditulis di skill modulnya, bukan di `CLAUDE.md`.

## 1. Cari dulu, baca belakangan
- Jangan `Read` file besar utuh. File raksasa repo ini: `src/lib/garage-service.ts`,
  `src/components/garage/garage-app.tsx`, `src/lib/garage-data.ts`, `src/db/schema.ts`,
  `src/app/globals.css`, `CLAUDE.md`, `drizzle/meta/*.json`.
- Urutan: `Grep` (mode `files_with_matches`) → `Grep -n` dengan `-C 3` / `head_limit` →
  `Read` dengan `offset` + `limit` hanya di sekitar baris yang ketemu.
- Cari definisi, bukan semua pemakaian: `Grep "export (async )?function namaFungsi"`.
- Tahu path pasti? Langsung `Read` bagian itu, jangan `Glob`/`ls` dulu.
- Jangan baca ulang file yang baru di-Edit (Edit sudah gagal kalau tidak cocok).

## 2. Potong output perintah
- Selalu batasi: `| tail -40`, `| head -60`, `| grep -E "error|fail|✗" | head -30`.
- Lint/build/test: tampilkan hanya error.
  - `npm run lint 2>&1 | grep -E "error|warning" | head -40`
  - `npm run build 2>&1 | tail -30`
  - `npx vitest run path/ke/file.test.ts --reporter=dot 2>&1 | tail -30`
    (jalankan test yang relevan saja, bukan seluruh suite).
- `git diff --stat` dulu; `git diff -- <file>` hanya untuk file yang perlu dilihat.
- `git log --oneline -10`, bukan `git log` penuh.
- Jangan `cat` file JSON/lock/migration snapshot; pakai `jq` dengan path spesifik.
- Perintah yang lama + bising: jalankan di background, cek hanya baris akhir.

## 3. Edit kecil, bukan tulis ulang
- `Edit` dengan `old_string` sependek mungkin tapi unik. Jangan `Write` ulang file besar.
- Perubahan mekanis berulang (rename di banyak file): satu `sed`/script, bukan puluhan Edit.
- Kumpulkan beberapa tool call independen dalam satu giliran (paralel).

## 4. Subagent, MCP, browser — hanya kalau perlu
- Subagent (`Agent`) mulai dari nol dan membaca ulang konteks: pakai hanya untuk
  pencarian sangat luas yang hasilnya cukup kesimpulan, atau kalau user minta.
- Jangan muat skill/MCP desain (ui-ux-pro-max, gsap-*, playwright) untuk tugas backend.
- `context7`/web: satu query terarah, bukan beberapa yang tumpang tindih.

## 4b. Playwright — pilih cara termurah
| Kebutuhan | Cara | Biaya token |
|---|---|---|
| Cek tampilan setelah ubah UI | `node scripts/ui-check.mjs /pos /inventory` | beberapa baris |
| Debug layout yang ketahuan bermasalah | Playwright MCP, seperlunya | besar (snapshot tiap aksi) |
| Sebelum rilis | `npm run test:e2e -- --reporter=line 2>&1 \| tail -30` | sedang |

- `scripts/ui-check.mjs` membuka tiap path di desktop 1366×900 dan mobile 390×844, lalu HANYA
  mencetak: console/page error, overflow horizontal (+ elemen penyebab), teks terpotong
  (uang/status/nama). Exit 1 bila ada temuan.
  - `--base=http://127.0.0.1:3000` (default), `--only=desktop|mobile`, `--shots=<dir>` simpan PNG
    (scale 1). Lihat PNG HANYA bila ada temuan, satu per satu, simpan di scratchpad.
  - Halaman yang butuh login: jalankan dulu tanpa login untuk halaman publik; untuk modul staf
    pakai MCP/E2E karena butuh sesi.
- Playwright MCP: setiap navigate/klik mengirim snapshot aksesibilitas seluruh halaman (ribuan
  token di POS/Inventory). Jangan `browser_snapshot` berulang; pakai `browser_evaluate` untuk
  mengambil angka/teks yang dicek saja, dan tutup browser setelah selesai.
- E2E: jalankan file/test yang relevan (`npx playwright test -g "POS"`), bukan seluruh suite tiap
  edit kecil. Tanpa `--trace off`, Playwright merekam trace di tiap test.
- Screenshot untuk dicek sendiri: `deviceScaleFactor: 1`; jangan dump HTML/DOM utuh.

## 5. Gunakan peta yang sudah ada
Sebelum menjelajah, cek ringkasan ini (baca bagian relevan saja, pakai Grep):
- `CLAUDE.md` → cari nama modul/fitur, ikuti path file yang disebut.
- `docs/FEATURE_MAP.md`, `docs/SYSTEM_OVERVIEW.md`, `docs/README_TECHNICAL.md`.
- `src/lib/api-route-catalog.generated.ts` untuk daftar endpoint (Grep, jangan Read).

## 6. Jawaban ke user
- Ringkas: apa yang diubah, hasil verifikasi, yang belum. Tanpa mengulang isi diff.
- Jangan menempelkan output panjang ke chat; sebut `file:baris`.

## 7. Tips sesi (untuk user)
- `/compact` saat percakapan sudah panjang dan topik berganti; `/clear` untuk tugas baru.
- Satu sesi = satu tugas. Tugas lain → sesi baru, konteks bersih.
- Perintah spesifik ("ubah X di `file.ts` fungsi Y") jauh lebih murah dari "cek kenapa POS error".
- Model lebih ringan (`/model`) untuk tugas mekanis; model besar untuk desain/arsitektur.
- `CLAUDE.md` dimuat di SETIAP sesi; jaga tetap ringkas (±9 KB). Matikan plugin Claude Code yang
  tidak dipakai (`/plugin`): daftar skill & tool plugin ikut dimuat tiap sesi.
