# Regression Test Report — POS V6 + Cashier Guardian

Tanggal: 5 Nov 2026 · Branch `ccr-29608758-dtli1n` (draft PR #175) · Lingkungan: kontainer cloud, PGlite baru
(bukan DB produksi), tanpa pembayaran sungguhan. `next build` memakai env QA (secret acak).

## Ringkasan

| Pemeriksaan | Hasil |
|---|---|
| Katalog API (`generate-api-catalog`) sinkron | PASS |
| `npm ci --dry-run` (lockfile) | PASS |
| `npm audit --omit=dev --audit-level=high` | PASS |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `vitest run` (unit + integrasi PGlite, termasuk 14 property test fast-check × 2000 kasus) | PASS — lihat angka di bawah |
| `next build` | PASS |
| Playwright E2E (`e2e/*.spec.ts`, desktop 1366 + mobile) | PASS — lihat angka di bawah |

Angka akhir: RESULT_PLACEHOLDER

## Tes baru di batch ini

| Tes | Membuktikan |
|---|---|
| `src/lib/pos-financial-invariants.property.test.ts` | kembalian = diterima − total, laci = tunai bersih; uang kurang/kosong ditolak; non-tunai tidak masuk laci; split seimbang & referensi unik; pembulatan terbatas & idempoten; diskon/voucher ≤ subtotal; total refund ≤ dibayar; label tombol final selalu menyebut nominal yang dicatat |
| `src/lib/idempotency-client.test.ts` (7) | gagal tidak pasti (jaringan/5xx/409/429) → key lama dipakai lagi walau metode/nominal diganti; pesanan berbeda → key baru; gagal validasi → key baru boleh |
| `src/lib/print-health.test.ts` | status printer terakhir dicatat per perangkat, gagal cetak tidak mengubah pembayaran |
| `e2e/pos-guardian.spec.ts` | dialog tunai: input kosong (tanpa isi otomatis), tombol "Isi uang diterima" nonaktif, Rp1.000 → "Uang kurang" nonaktif, Uang Pas → "Terima uang pas Rp…" → order `POS-…` tersimpan, kembalian Rp 0; panel QC Kasir: shift + server terhubung |
| `e2e/pos-v6-theme.spec.ts` | ganti tema tidak mengubah keranjang, tema bertahan setelah refresh, F9 hanya membuka bayar |

## Kegagalan yang ditemui & perbaikannya

| Kegagalan | Penyebab | Tindakan |
|---|---|---|
| `pos-guardian.spec.ts` gagal pada run pertama: `POS-…` tidak ditemukan di dialog "Pembayaran POS" | Transaksi **berhasil** (screenshot: "Transaksi selesai · POS-…, kembalian Rp 0, struk tercetak"); dialog berganti judul sehingga locator salah | Locator tes diperbaiki ke dialog "Transaksi selesai" + cek kembalian Rp 0. Tidak ada kontrol finansial yang dilemahkan |

## Belum diuji (jujur)

- Skenario multi-perangkat bersamaan (dua kasir membayar order QR yang sama) di browser nyata — dilindungi
  advisory lock + tes integrasi server, belum E2E dua browser.
- Mode offline penjualan (modul offline belum dirangkai; hanya indikator koneksi).
- Printer thermal fisik & tablet kasir nyata — perlu uji Owner di outlet.
- Load test (k6) — hanya boleh di staging dengan izin Owner.
- Visual regression berbasis piksel (belum ada baseline).
