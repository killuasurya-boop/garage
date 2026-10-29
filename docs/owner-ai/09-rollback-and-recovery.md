# 09 — Rollback & pemulihan Owner AI

| Situasi | Langkah aman | Data |
|---|---|---|
| Deploy gagal health/smoke | Otomatis: `deploy-manual.sh` kembali ke image `:previous` | Migrasi 0175 additive tetap — kode lama tidak membacanya |
| Rilis bermasalah setelah jalan | Revert PR di GitHub → `release-check` → deploy | Tabel `ai_*` boleh dibiarkan; tidak ada data bisnis di dalamnya |
| ChatGPT berperilaku aneh | AI Connect → **Jeda** (seketika) atau **Cabut semua** (alasan + 2FA) | Token lama ditolak gateway, refresh token dicabut |
| Dugaan kompromi | Cabut semua → ganti password Owner + reset 2FA → periksa **Timeline operasi** & Audit (`device` `mcp:chatgpt` / `owner-ui:ai-command`) | Audit tidak dihapus; koreksi lewat reversal |
| Perubahan salah lewat AI (mis. harga) | Lihat receipt (operasi, sidik) → jalankan perubahan baru yang benar (versi baru), jangan edit riwayat | Order lama tetap memakai harga snapshot |
| Status operasi `UNKNOWN` | Jangan ulang buta: buka receipt operasi, cek data sumber; ulang hanya bila pasti belum terjadi | Token sekali pakai mencegah eksekusi ganda |

Kill switch & pencabutan tidak mempengaruhi POS, KDS, closing, atau dashboard (gateway hanya menolak permintaan ChatGPT).
