# Garage OS — Living Intelligence Network V1

**Status: preview UI; belum di-deploy dan belum mengubah operasional Garage OS.**

## Tujuan

Mewujudkan visual AYA Intelligence sebagai pusat keterhubungan 16 domain asli Garage OS. Ambient line flow selalu bergerak ketika halaman tampak, sedangkan status aktivitas/risiko hanya boleh bersumber dari data terverifikasi.

## Route dan komponen

- `/control/living-intelligence` — halaman Owner-only melalui `ControlDashboardRoute`; berisi data **SIMULASI**.
- `src/components/garage/living-intelligence-network.tsx` — komponen visual dengan props `demo` dan `signals`.
- `src/components/garage/living-intelligence-network.css` — CSS animasi dan responsif.
- Reuse aset resmi `AyaAvatar` dan domain dari `GARAGE_DOMAINS` (bukan logo atau daftar domain baru).

## Semantik animasi

1. Node tetap dan alur ambient berfungsi sebagai visualisasi arsitektur, **tidak menandakan transaksi baru**.
2. `unknown` = sumber belum ada/tidak terverifikasi; **jangan menampilkan normal** ketika data kosong.
3. `active` = aktivitas dari backend; `warning` / `critical` = peringatan dari sumber yang sah.
4. `normal` hanya ketika backend menyuplai `updatedAt` yang valid, tidak melebihi 120 detik, tidak jauh di masa depan, dan status benar-benar `normal`.
5. `offline` harus berbeda dari `unknown`; data stale turun menjadi `unknown`.
6. React memeriksa freshness 30 detik sekali, animasi pause saat tab tidak terlihat, dan menghormati reduced-motion.
7. Simulasi Normal/Masalah/Analisis/Verifikasi hanya menampilkan visual. Tombolnya tidak mengubah data Garage OS.

## Kontrak integrasi selanjutnya

`<LivingIntelligenceNetwork demo={false} signals={healthSignals} />`

Bentuk satu sinyal:

```ts
{ state: "normal" | "active" | "warning" | "critical" | "offline" | "unknown",
  updatedAt: "2026-11-06T00:00:00.000Z",
  detail: "Fakta singkat dari service resmi" }
```

**Sumber rekomendasi:** agregator backend khusus Owner, membaca status modul yang sudah ada. Normalisasi tanggal dilakukan di server; hasil harus memenuhi permission dan outlet scoping. Jangan memanggil 16 endpoint langsung dari browser setiap frame.

## Gate integrasi

- [ ] Typecheck/ESLint/build Next.js pada repo lengkap.
- [ ] Test responsivitas dan render Chrome/Firefox pada route asli.
- [ ] Test akses Owner vs Manajer/Kasir/Waiter.
- [ ] Verifikasi status stale, offline, error, future timestamps.
- [ ] Test pause/resume, reduced motion, interaksi keyboard dan screen reader.
- [ ] Profiling CPU/GPU khusus tablet kasir; hindari membebani POS.
- [ ] Buktikan zero side effects dan tidak mengubah approval, WMS, finance, closing.
- [ ] Sambungkan live signals hanya setelah kontrak API dan security review.
- [ ] Review Owner sebelum merge dan deployment produksi.

Tidak ada webhook/MCP write/approval otomatis dalam PR ini.