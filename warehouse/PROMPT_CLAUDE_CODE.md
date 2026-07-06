# Prompt untuk Claude Code — Bangun GARAGE WMS

> Salin seluruh teks di bawah garis ini dan tempel ke Claude Code (di dalam folder project kosong / repo baru). Sertakan juga file `GARAGE WMS.dc.html`, `support.js`, dan `README.md` dari paket handoff ke dalam repo agar Claude Code bisa membacanya sebagai referensi.

---

Saya ingin kamu membangun **GARAGE WMS** — Warehouse Management System untuk bisnis F&B "GARAGE Coffee & Motor". Di repo ini ada paket desain: `README.md` (spesifikasi lengkap), `GARAGE WMS.dc.html` (prototipe UI high-fidelity), dan `support.js`. **Baca `README.md` sampai habis dan buka `GARAGE WMS.dc.html` sebagai acuan visual sebelum mulai.** Prototipe itu adalah referensi tampilan & perilaku — bangun ulang di stack nyata, jangan menyalin HTML-nya mentah.

## Stack
- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS (petakan design tokens dari README ke `tailwind.config`)
- Framer Motion (animasi sesuai tabel di README, hormati `prefers-reduced-motion`)
- Recharts (area & bar chart)
- Prisma + PostgreSQL (pakai skema di bagian 10 README)
- TanStack Query untuk data fetching, Zustand untuk state UI (warehouse scope, sidebar, drawer)
- NextAuth untuk login + role-based access (OWNER, MANAGER, WAREHOUSE_ADMIN, RECEIVING_STAFF, BARISTA)

## Design tokens (wajib persis)
garage-red #C8102E, graphite #2F3136, surface-2 #F8F9FB, border #E8E8E8, text #111/#6B7280, status green #16A34A / amber #D97706 / red #DC2626 / blue #2563EB, purple #7C3AED. Font Inter (semua), JetBrains Mono (SKU/batch/nomor dokumen). Merah adalah satu-satunya warna aksen.

## Bangun bertahap (jangan sekaligus). Konfirmasi tiap fase selesai sebelum lanjut:

**Fase 1 — Fondasi:** Setup Next.js + Prisma + Tailwind dengan tokens. Buat schema lengkap dari README bagian 10, jalankan migration, seed data contoh (produk, warehouse WH-01/Bar/Dapur, beberapa batch & resep). Bangun shell UI: sidebar graphite 240px collapsible ke 64px (lihat README bagian 5), header 60px dengan warehouse selector 3-scope + bell + avatar. Auth + role.

**Fase 2 — Inventory + Receiving:** Halaman Inventory (tabel, filter, search, bulk action bar, tambah produk). Receiving form (stepper 5 langkah, input qty/HPP, QC PASS/DISCREPANCY/REJECT, batch+expired+lokasi). Saat receiving di-complete: tambah stok + buat batch + update HPP rata-rata produk + catat StockMovement.

**Fase 3 — Internal Order + FEFO (fitur inti):** Builder slide-over (pilih outlet Dapur/Bar → tambah item → tampilkan batch FEFO otomatis → keranjang qty → total HPP live → konfirmasi). Saat issue: potong stok gudang pakai FEFO (batch terdekat expired dulu), tambah sub-inventory outlet, catat nilai HPP + StockMovement. Validasi: tidak boleh keluar melebihi stok.

**Fase 4 — Recipe/BOM + Keuangan/HPP:** CRUD resep dengan BOM. Hitung otomatis (jangan disimpan): cogs = Σ(qty × product.hpp), foodCostPct, margin. Halaman Keuangan & HPP: master modal bahan + tabel HPP/margin per resep dengan food cost ratio berwarna (hijau ≤30%, amber ≤38%, merah >38%). Saat HPP bahan berubah dari receiving, HPP resep otomatis ikut.

**Fase 5 — Reports + Stock Opname + Adjustment + Transfer:** Reports pergerakan stok (date filter, KPI, bar chart, tabel mutasi dari StockMovement). Stock Opname (sesi, input fisik, variance). Transfer antar warehouse dengan approval.

**Fase 6 — Smart 2026:** Smart Reorder (forecast sederhana dari rata-rata konsumsi StockMovement + saran qty). Cold Chain Monitor (model ColdChainReading + endpoint webhook IoT + grafik tren + alert zona aman). Owner Analytics (food cost per outlet, margin, waste, top bahan).

**Fase 7 — Settings + Integrasi Garage OS:** Settings master-detail 7 tab (lihat README 6.15) dengan toggle fungsional tersimpan ke DB. Endpoint webhook `POST /api/webhooks/garage-os/sale`: terima penjualan POS → baca BOM resep menu → otomatis buat Internal Order untuk memotong bahan.

## Aturan penting
- Setiap mutasi stok HARUS lewat satu fungsi terpusat yang menulis ke `StockMovement` (ledger) — supaya Reports & audit akurat.
- HPP, food cost, margin SELALU dihitung saat query, tidak di-hardcode.
- UI harus se-presisi prototipe: spacing, radius, shadow, animasi sesuai README bagian 7 & 8.
- Mulai dari Fase 1. Tunjukkan rencana struktur folder dulu, lalu kerjakan. Tanya saya jika ada keputusan arsitektur yang ambigu.
