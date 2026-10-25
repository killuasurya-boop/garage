# Pembaruan dependensi keamanan — Oktober 2026

**Tanggal:** 25 Okt 2026. Pembaruan terkontrol, **tanpa** `npm audit fix --force`.

## Ringkasan audit

| | Critical | High | Moderate | Total |
|---|---|---|---|---|
| Sebelum (main `64688fa`) | 3 | 17 | 14 | 34 |
| Sesudah | 0 | 0 | 0 | **0** |

Catatan audit di PR #66 menyebut 38 advisori. Sebagian sudah hilang sebelum PR ini karena dependensi yang berubah di #67–#75.

## Yang dinaikkan

### Dependensi langsung

| Paket | Dari | Ke | Alasan |
|---|---|---|---|
| `next` / `eslint-config-next` | 16.2.6 | **16.4.3** (dipin) | **Critical:** bypass middleware/proxy App Router dan DoS Server Action. Ikut menutup `postcss` (XSS / baca file). |
| `zod` | ^4.4.3 | ^4.6.7 | **High:** validasi constraint besar menghabiskan memori. |
| `better-auth` | ^1.6.11 | ^1.7.12 | Turunan lewat peer `drizzle-kit`/`vitest`. Skema auth (termasuk `two_factor.verified`/`failed_verification_count`/`locked_until`) sudah sesuai, jadi **tanpa migrasi**. |
| `sharp` | ^0.34.5 | **^0.35.5** (major) | **High:** CVE libvips/libheif. Dipakai di upload foto menu/produk, kartu member, QR meja, foto nota, dan hero landing. Prebuilt linux-x64 libvips 8.18.7; base Docker `node:22-bookworm-slim` tidak berubah. |
| `shadcn` (CLI) | ^4.7.0 | ^4.22.1 | **High** lewat `zod` dan MCP SDK. |
| `vitest` | ^4.1.8 | ^4.1.12 | **Moderate:** path traversal / injeksi kode di `@vitest/mocker`. Tetap di 4.x, bukan 5. |

### Dependensi tidak langsung
`npm audit fix` tanpa `--force` memperbarui: `dompurify`, `proxy-addr` (critical), `axios`, `undici`, `follow-redirects`, `body-parser`, `brace-expansion`, `browserslist`, `fast-uri`, `ip-address`, `js-yaml`, `nanoid`, `source-map-js`, `vite`, `@modelcontextprotocol/sdk`, `hono`, `@hono/node-server`, `qs`, `postcss-selector-parser`, `baseline-browser-mapping`.

### `overrides` di `package.json`
Untuk dua paket ini npm hanya menyarankan *downgrade*, jadi dipakai `overrides`:
- `exceljs` → `uuid ^11.1.1`. exceljs 4.4 hanya memakai `uuid.v4()`, yang masih ada di uuid 11. Diuji lewat tes ekspor/impor Excel.
- `@esbuild-kit/core-utils` → `esbuild ^0.25.12`. Paket ini rantai dev-only `drizzle-kit` (`db:generate`/`migrate`) dan tidak masuk image runtime. `db:generate` tetap berjalan ("No schema changes").

## Catatan teknis lockfile
- npm 10.9 (Node 22) sempat crash `Cannot read properties of null (reading 'edgesOut')` saat menyelesaikan peer opsional bertingkat (`better-auth` → `vitest` → `@vitest/browser-playwright`) **selama `node_modules` lama masih ada**.
- Lockfile akhirnya dibuat ulang oleh npm 10 sendiri setelah `node_modules` dihapus, lalu diverifikasi dengan `npm ci` (npm 10, sama dengan CI dan Docker).
- Lockfile buatan npm 11 **tidak** dipakai karena ditolak `npm ci` npm 10.

## Verifikasi
- `npm audit`: 0 kerentanan; `npm ci` (npm 10) bersih.
- `db:generate`: tanpa perubahan; tsc bersih; 175 file / 1140 tes Vitest lolos; `next build` lolos.
- Lint: 0 error. eslint-config-next 16.4 menambah aturan `no-location-assign-relative-destination` (19 peringatan). Pemakaian `window.location.assign/href` itu memang disengaja untuk reload penuh (misalnya setelah login/logout), jadi dibiarkan sebagai peringatan.
- Browser (dev Next 16.4.3 + PGlite) di 1366×900 & 390×844: login Owner, `/`, `/pos`, `/control/cash-closing`, dan `/shift` tanpa overflow dan tanpa error console; unduh Excel OK; upload foto menu diproses sharp 0.35 menjadi webp.

## Ke depan
- Jalankan `npm audit` sebelum setiap rilis besar. Pembaruan major (misalnya Vitest 5, Next 17) dikerjakan di PR terpisah dengan tes penuh.
- Hapus `overrides` begitu exceljs atau drizzle-kit merilis versi dengan dependensi aman.
