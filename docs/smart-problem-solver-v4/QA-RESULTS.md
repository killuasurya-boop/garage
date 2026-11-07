# AYA Problem Solver V4 — QA Results

Run 6 Nov 2026, branch `ccr-29608758-dtli1n`. Angka dari run nyata.

| Suite | Jumlah | Hasil |
|---|---|---|
| `garage-problem-solver.test.ts` (unit) | 5 | lulus |
| `garage-problem-solver.eval.test.ts` (dataset evaluasi) | 13 | lulus |
| `ai-problem-cases.integration.test.ts` (PGlite) | 4 | lulus |
| `intelligence-network.integration.test.ts` (PGlite) | 2 | lulus |
| Seluruh vitest | 1825 | lulus (274 file) |
| E2E `e2e/aya-solver.spec.ts` | 1 | lulus (run penuh 12/12) |

## Yang dibuktikan
- Hanya tool R0 dari whitelist; tidak ada tool tulis yang dipanggil.
- Error tool tidak diteruskan (hanya kode ref); timeout dibersihkan.
- Ke provider AI hanya `aiSafeExcerpt` (field whitelist: angka, ID, status, periode) — tanpa nama/telepon/catatan bebas.
- Prompt injection di data ("ACC", "jalankan semua", "abaikan instruksi") tidak mengubah perilaku.
- Sumber data rusak/lambat → pesan asli (SQL) tidak bocor, ada ref, status NEED_REVIEW, keputusan ditahan; timeout dilaporkan.
- Belum ada tes otomatis khusus "provider AI mati" (fallback ke laporan aturan ada di kode, belum diuji terpisah).
- Fakta / Dugaan / Belum diketahui selalu dipisah; bukti kurang = perlu review, bukan tuduhan.
- Kasus: hanya Owner langsung (bukan Manajer/agent key); linimasa append-only (UPDATE ditolak DB);
  analisis ulang menaikkan versi; keputusan dengan sidik lama = STALE; verifikasi membandingkan hasil nyata.
