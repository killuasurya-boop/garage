# Kasir lebih mudah, tetap teliti (Owner, 6 Nov 2026)

## Perubahan
| Bagian | Dulu | Sekarang |
|---|---|---|
| Modal awal laci (buka shift) | Kelipatan Rp50.000, Rp50.000–500.000 | Berapa pun sesuai uang di laci, kelipatan Rp100 (mis. Rp55.200, Rp456.000), maks. **Pengaturan → Shift → Batas atas modal awal laci** (default Rp2.000.000). Hitungan per pecahan tetap wajib sama dengan total. |
| Tutup shift | Hitung 2x (blind) + hitungan ke-3 bila beda | **Hitung sekali**. Setelan "hitung ganda" tetap ada di Pengaturan bila Owner ingin menyalakan lagi (migrasi 0181 mematikannya). |
| Kas keluar/masuk laci | ≥ Rp50.000 butuh PIN Manajer atau pengajuan; setoran juga | **Langsung tercatat & memotong laci** tanpa ACC. Pengecualian: **kasbon** dan **refund pelanggan** tetap ACC. |

## Pengaman (supaya tetap teliti)
- **Batas kas keluar per shift** (`cashMovementShiftLimit`, default Rp1.000.000): bila total kas keluar kasir di shift itu
  melewati batas, kasir diminta PIN Manajer/Owner atau kirim pengajuan.
- **Kas keluar ≥ Rp50.000 tanpa foto nota** muncul di **Kontrol Kas → Kas keluar tanpa foto nota** (baca-saja, untuk dicek Owner).
  Setoran bukan biaya, jadi tidak masuk antrean ini.
- Rule risiko **CASH_OUT_DIRECT_HIGH**: kas keluar langsung yang banyak/besar dalam satu shift menjadi prioritas pemeriksaan
  (bukan tuduhan).
- Setoran tetap "dalam perjalanan" sampai dikonfirmasi orang lain (`confirmCashDeposit`).
- Selisih kas saat tutup shift tetap tercatat, masuk antrean pemeriksaan dan final Owner seperti sebelumnya.
- Owner/Manajer tetap bisa batal/koreksi kas keluar selama shift masih buka (alasan + audit).

## Yang perlu disampaikan ke staf
1. Modal awal diisi sesuai uang yang benar-benar ada di laci (boleh pecahan).
2. Tutup shift cukup hitung sekali — hitung pelan-pelan, per pecahan.
3. Kas keluar langsung tercatat; foto nota untuk kas keluar ≥ Rp50.000.
4. Kasbon dan refund pelanggan tetap minta ACC Manajer/Owner. Setoran tidak perlu ACC lagi.
