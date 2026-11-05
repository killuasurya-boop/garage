# AYA Smart Problem Solver V4 — MCP Tools

## `garage_analisis_masalah` (baru, PR #176 + Batch 2)
| Atribut | Nilai |
|---|---|
| Risiko | **R0** (baca-saja), `write: false`, `domain: sistem` |
| Akses | Owner saja (cek di `run`; izin dasar `dashboard:read`) — juga route `POST /api/ai/problem-solver` |
| Input | `masalah` (5–3000), `mode` `quick`/`full`, `gunakanAi` (default true) |
| Output | `diagnosis` (bukti per sumber, fakta angka, hipotesis + dukungan, keterbatasan, laporan wajib), `ai` (saran tersensor atau `unavailable`), `mode` |
| Batas | maks 6 sumber (quick) / 15 (full), 3 paralel, 8 dtk per sumber (timer selalu dibersihkan), rate limit route 8/menit |

## Sumber R0 yang boleh dibaca (daftar putih `READ_PROBES`)
`ringkasan_hari_ini`, `daftar_order`, `rekap_kas_harian`, `pengawasan_kas`, `daftar_approval`, `garage_list_anomaly_cases`,
`daftar_menu`, `margin_menu`, `cek_stok_bahan`, `rekomendasi_opname`, `status_operasional`, `ringkasan_marketing`,
`status_meja`, `daftar_staf`, `daftar_event`. Nama tool tidak pernah diambil dari input/model; layanan menolak tool tulis
atau non-R0 sekalipun nama cocok.

## Tindakan (R1–R3) — hanya draf
Usulan menyebut `toolCandidate` (mis. `koreksi_metode_bayar`, `putuskan_approval`) dengan `execution: "draft_only"`.
Pelaksanaan nyata wajib lewat `runToolWithConfirmation` (preview → token → ACC Owner → `kode2fa` untuk R3 → receipt →
baca ulang). Problem Solver sendiri tidak pernah memanggil tool tulis.

## Perubahan Batch 2
- Fakta angka per sumber (`extractFacts`): omzet, transaksi, void/refund, kas kurang/lebih, QRIS beda, selisih belum
  verifikasi, setoran belum konfirmasi, pengajuan menunggu & risiko tinggi & gagal dilaksanakan, stok minus (SKU), stok
  menipis, tiket terlambat, margin rendah, tagihan meja dari kemarin.
- Hipotesis berbasis aturan dengan tingkat dukungan `didukung / lemah / tidak_didukung / belum_diuji` + cara membuktikan.
- Laporan wajib: masalah, fakta, dugaan, belum diketahui, akar masalah (selalu "belum pasti" kecuali didukung), dampak,
  2–3 opsi + konsekuensi, rekomendasi, eksekusi `BELUM_DILAKUKAN`, hasil `BELUM_ADA`, bukti (waktu cek, waktu data, ref).
- Error sumber: teks asli hanya di log server; hasil memuat "Sumber gagal dibaca." + ref.
- `daftar_approval` kini menyaring per outlet untuk Manajer.
