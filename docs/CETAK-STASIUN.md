# Cetak chit di printer Bar & Dapur (tablet Android + Bluetooth)

Tiap stasiun (Bar, Dapur) punya tablet dan printer Bluetooth sendiri. Tiket baru untuk stasiun itu
menumpuk di papan **Production Hub**; satu ketukan **CETAK** mengirim semuanya ke printer.

## Kenapa lewat RawBT dan bukan langsung dari Chrome
Printer Rongta RPP02N memakai **Bluetooth klasik (SPP)**. Chrome di Android hanya bisa berbicara ke
printer **BLE**, jadi halaman web tidak bisa mengirim langsung. Aplikasi **RawBT** (gratis, Play Store)
menjembatani: halaman membuka tautan `rawbt:` berisi data ESC/POS, RawBT meneruskan ke printer.

Konsekuensi: Chrome baru mengizinkan membuka aplikasi lain **setelah ketukan pengguna**, jadi cetak
bukan sepenuhnya diam-diam. Tiket baru berbunyi/tampil di papan (suara Production Hub), lalu staf
mengetuk satu tombol **Cetak N tiket baru**.

## Pemasangan per tablet (sekali, ±10 menit)
1. Pasang **RawBT** dari Play Store.
2. Pairing printer di Pengaturan Bluetooth Android (PIN biasanya `0000` atau `1234`).
3. Di RawBT: **Printer → Bluetooth → pilih printer**, **Driver: ESC/POS (general)**, lebar kertas 58 mm.
4. Buka `https://garagecoffee.id`, login dengan akun workstation stasiun (Bar / Dapur), buka **Production Hub**.
5. Tekan **Printer Bar: OFF** hingga **ON**, lalu **Pengaturan → Tes cetak**.
   - Tidak membuka RawBT / tidak mencetak → ganti **Mode kirim** ke **B · intent**, tes lagi.
6. Ketuk **Cetak** setiap ada tiket baru; tiket yang sudah dicetak tidak masuk antrean lagi
   (penanda `kitchen_tickets.chit_printed_at`, berlaku lintas perangkat).

## Perilaku
- Yang tercetak hanya tiket **stasiun tablet itu** (filter papan: Bar / Dapur; "All" mencetak keduanya).
- Tiket yang dibuat sebelum tombol ON tidak dicetak otomatis; gunakan **Cetak ulang** (6 tiket terakhir).
- Chit berisi nama item, jumlah, catatan, meja, jenis pesanan, waktu — **tanpa harga**.
- Jika kertas macet, gunakan **Cetak ulang**; penanda "tercetak" dipasang saat tombol ditekan
  (browser tidak bisa memastikan printer benar-benar mencetak).

## Bila ingin cetak otomatis tanpa ketukan
Ganti printer stasiun ke model **BLE** (Web Bluetooth langsung dari Chrome) atau pakai PC kecil dengan
agen cetak lokal (`npm run print:server`) seperti kasir. Kode antrean/penanda tercetak sudah siap dipakai
untuk jalur itu.

## Teknis
- `src/lib/station-print.ts` — pembentuk chit, byte ESC/POS, tautan RawBT.
- `src/components/garage/station-print-panel.tsx` — tombol/antrean di Production Hub.
- `POST /api/production/print-ack` — menandai tiket tercetak (izin `kitchen:write`).
- Migrasi `0113_ticket_chit_printed`.
