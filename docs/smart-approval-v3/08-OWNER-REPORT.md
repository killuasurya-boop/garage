# Smart Approval V3 — 08 Laporan Owner

## ✅ Selesai
- Keputusan ≠ eksekusi: `execution_status` (berjalan/berhasil/gagal/tidak perlu/legacy); gagal dijalankan kembali
  ke Menunggu dengan jejak audit, tidak pernah tampil "berhasil".
- Sidik data (snapshot hash): bila order/kas/biaya berubah sejak Anda membuka pengajuan → `STALE`, keputusan ditolak.
- Bulk setuju hanya untuk risiko rendah/sedang non-uang; R3/void/refund/kas/stok ditolak di server.
- Auto-approval: hanya biaya, risiko rendah/sedang, di bawah ambang, pemohon ≠ penyapu, maks 3/hari/pemohon.
- Pengajuan punya outlet + nominal angka (migrasi 0177); Manajer hanya bisa memutus outlet sendiri.
- Owner Decision Center `/control/decision`: KPI nyata, antrean prioritas, penjelasan A–J berbasis aturan,
  Setujui/Tolak/Tunda/Minta Revisi, R3 wajib kode 2FA Owner, Tanya AYA per pengajuan.
- AYA Problem Solver V4 `/control/aya-solver` + kasus berversi (migrasi 0178), Living Intelligence
  `/control/intelligence` (16 domain, tanpa sinyal = "Belum terverifikasi").

## ⚠️ Kendala / belum
- A8: pemohon split bill (PCX) tercatat sebagai nama, bukan ID — perlu keputusan Owner.
- A9: jalur PIN/board lama untuk R3 belum meminta TOTP (Decision Center sudah).
- Migrasi 0177/0178 belum diuji di staging; belum di-merge/deploy.

## ⭐ Rekomendasi
1. Uji migrasi 0177/0178 di staging (`scripts/deploy-staging.sh`) dengan data produksi teranonim.
2. Setelah lolos, merge + deploy di luar jam operasional, dengan backup terverifikasi.
3. Putuskan A9: wajibkan 2FA juga di board lama untuk R3.

## 🔢 Pilihan Owner
1. Merge & deploy batch ini (setelah staging).
2. A8: simpan ID pemohon PCX (perubahan kecil, tanpa hapus data).
3. A9: wajib TOTP untuk R3 di semua jalur.
4. Lanjut Batch 7: Document Approval, panel AI Governance, PDF keputusan.
