# Garage Control Center

Layar operasional bersama untuk **semua staf** (sidebar → Ringkasan → *Control Center*,
`/os?module=ops-center`). Menjawab dalam 2–3 detik: apa yang terjadi, apa yang urgent, apa yang
harus dikerjakan **sekarang**, dan apakah Garage membaik.

- Satu sumber data: Production Hub (`getProductionBoard`) + tabel yang sudah ada. Tidak ada tabel
  order/produksi baru, tidak ada migrasi.
- **Tanpa nominal uang** (omzet, harga, margin, gaji) — aman dilihat semua role.
- Data diperbarui tiap 10 detik (berhenti saat tab tidak terlihat) + langsung setelah aksi produksi.
- Tombol **MULAI BATCH** memakai API batch Production Hub yang sama (atomik; bila batch sudah diambil
  staf lain, server menolak dan layar tidak berubah). Hanya tampil untuk akun yang boleh produksi
  di station itu.

## File
- `src/lib/ops-center-engine.ts` — engine keputusan (murni, diuji `ops-center-engine.test.ts`)
- `src/lib/ops-center.ts` — agregasi data (diuji `ops-center.integration.test.ts`)
- `src/app/api/ops-center/route.ts` — `GET`, semua staf aktif
- `src/components/garage/ops-center-view.tsx`, `ops-center/ops-parts.tsx` — UI

## Sekarang kerjakan (Next Best Action, per station)
Urutan pelanggan tetap **FIFO** (jam order). Prioritas produksi:
1. **Lindungi SLA** — order menunggu tertua sudah ≥ 80% target dan tidak termasuk batch mana pun →
   kerjakan order itu dulu (batch lain menunggu, walau lebih efisien).
2. **Smart Batch** — saran batch Production Hub (produk + varian + catatan sama, dalam batch window)
   dengan skor ≥ 50; batch yang memuat order tertua didahulukan (anti starvasi).
3. **FIFO** — order tertua berikutnya.

Kustomisasi berbeda (less ice, no sugar, catatan lain) **tidak pernah digabung** (kunci batch =
station | produk | varian | catatan).

### Batch Score (0–100)
`order (maks 5 → 40) + porsi (maks 10 → 30) + keamanan SLA`
(umur porsi tertua < 50% target → 30, < 80% → 15, ≥ 80% → 0).
Label: ≥ 75 TINGGI, ≥ 50 SEDANG, < 50 RENDAH. "Hemat N× mulai" = porsi − 1.

## Status operasional
| Status | Salah satu kondisi |
|---|---|
| KRITIS | ≥ 3 order lewat SLA · order tertua ≥ 2× target · beban ≥ 130% |
| RUSH | ≥ 1 order lewat SLA · ≥ 3 order mendekati SLA · beban ≥ 90% · ≥ 8 order menunggu |
| SIBUK | ≥ 1 mendekati SLA · beban ≥ 60% · ≥ 4 menunggu · ≥ 1 pesanan siap tertunda |
| NORMAL | selain itu |

"Mendekati SLA" = umur ≥ 80% target; "lewat SLA" = umur > target. Target: minuman 5 menit,
makanan 15 menit (`kitchenTargetMinutes`).

## Beban station
`beban % = menit kerja antre ÷ (staf hadir × 30 menit) × 100`
- menit kerja = tiket menunggu × durasi kerja + tiket diproses × ½ durasi kerja
- durasi kerja = rata-rata produksi nyata hari ini (mulai → siap) bila ≥ 5 sampel; selain itu
  50% target SLA
- staf hadir = absen hari ini & belum pulang, workstation bar/all (Bar) atau dapur/all (Dapur); min 1
- Serving = pesanan siap ÷ (waiter hadir × 4) × 100

## KPI (timestamp nyata `kitchen_tickets`)
| KPI | Rumus |
|---|---|
| Tepat waktu | tiket siap dengan (readyAt − createdAt) ≤ target ÷ tiket siap × 100 |
| Rata-rata saji | avg(readyAt − createdAt) |
| Rata-rata antre | avg(acceptedAt − createdAt) |
| Ambil pesanan | avg(deliveredAt − readyAt) |
| Efisiensi batch | porsi siap via batch ÷ porsi siap yang batchEligible × 100 |
| Dikembalikan | tiket dengan issueAt hari ini (bukan batal) |
| Batal | order hari ini berstatus void/rejected/cancelled |
| Tren | hari ini vs kemarin vs rata-rata 7 hari sebelumnya |

**Performa saya**: tiket hari ini yang mencatat nama Anda (mulai/siap/antar). Hanya terlihat oleh
diri sendiri; tidak ada ranking publik.

## Peringatan, insight, perkiraan
- Peringatan: lewat/mendekati SLA, station tertahan (beban ≥ 90%), pesanan siap > 3 menit belum
  diantar, bahan resep batch berstatus *low*, bahan di bawah minimum, peluang batch.
- Insight hanya bila datanya cukup: jam tersibuk (≥ 20 order 7 hari), produk paling sering di-batch
  (≥ 5 porsi), perubahan kecepatan station ≥ 15% (≥ 5 tiket hari ini).
- Perkiraan 60 menit: order pada jam & hari yang sama, 4 minggu terakhir; ditampilkan hanya bila
  ≥ 2 minggu ber-data (rentang min–maks). Selain itu "Data historis belum cukup".
- Persiapan & stok: bahan *low*/*watch* dari Warehouse — rekomendasi saja, stok tidak dipotong.

## Belum dikerjakan (TODO)
- Target SLA per station/produk yang bisa diubah dari Pengaturan (sekarang tertanam saat tiket dibuat).
- Batch window default 2 menit (`productionBatchWindowSec`, bisa diubah Owner di Pengaturan).
- Log event produksi khusus & realtime push (sekarang polling 10 detik).
