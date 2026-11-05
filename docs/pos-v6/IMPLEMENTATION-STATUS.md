# Implementation Status — POS V6 + Cashier Guardian

| Langkah | Status |
|---|---|
| 1 Audit total | ✅ (`GOD-PLUS-PLUS-AUDIT.md`) |
| 2 Matriks P0–P3 | ✅ — 0 P0, 2 P1 (diperbaiki), 3 P2 (2 diperbaiki, 1 sebagian), 1 P3 (keputusan Owner) |
| 3 Risiko pembayaran & keuangan | ✅ F-01, F-02, F-03 |
| 4 Produk/QR/meja/Waiter/tiket/struk | ✅ diverifikasi; status printer F-05 |
| 5 Laporan shift, ledger, petty cash | ✅ diverifikasi (tes integrasi existing) |
| 6 UI V6 + tema | ✅ (5 tema: 4 V6 + Garage Dark) |
| 7 Kecepatan kasir | ✅ shortcut F1–F4/F9, Uang Pas, 1-tap; ⏳ jalur cepat take away tanpa langkah meja/pelanggan = pilihan Owner |
| 8 QC otomatis | ✅ property test, unit, E2E guardian + tema |
| 9–10 Simulasi & regresi | ✅ skenario A, B, D(unit), G (E2E); ⏳ C/H multi-perangkat & E offline belum (lihat laporan) |
| 11 Dokumentasi | ✅ `docs/pos-v6/*` |
| 12 Kesiapan | Siap review Owner; deploy hanya setelah kasir tutup & persetujuan Owner |

## Batch Belum Bayar + Layar Penuh + Modul Popup (Owner, 5–6 Nov 2026)

| Item | Status |
|---|---|
| Tagihan Belum Bayar terkelola (Cash vs QRIS/Transfer/E-Wallet, umur, prioritas, pengingat 30 mnt, popup detail nama/WA/pesanan) | ✅ |
| "Bayar nanti" tidak lagi tampil sebagai Cash (metode "Belum dipilih"), WA ikut disimpan | ✅ |
| Final Bayar: tunai wajib isi (kosong ≠ uang pas), label menyebut nominal, tema V6 | ✅ |
| Peringatan tagihan belum bayar saat tutup shift | ✅ |
| Layar penuh: tombol topbar + otomatis sentuhan pertama + Cek layar di QC | ✅ |
| Modul POS jadi popup (tanpa tab baru); PDF tampil inline | ✅ |
| Sidebar ciut/lebar beranimasi, garis merah selalu nyala, animasi ikon | ✅ |
| Tes: `pos-pending-bills.test.ts` (6), integrasi open bill +1, E2E `pos-pending.spec.ts` | ✅ |
