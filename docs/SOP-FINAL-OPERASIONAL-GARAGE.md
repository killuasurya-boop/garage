# SOP Final Operasional GARAGE

Dokumen ini dipakai saat pilot dan go-live outlet. Semua staf harus mengikuti alur ini agar transaksi, kitchen, finance, dan audit tetap rapi.

## 1. SOP Owner / Admin

Sebelum shift:

1. Buka `/login`.
2. Login sebagai Owner atau Admin.
3. Buka `/os?module=settings`.
4. Cek:
   - Service charge.
   - PB1 / pajak.
   - Branding struk.
   - Sound QR order.
   - Printer default.
   - Loyalty point.
5. Klik `Test Sound`.
6. Klik `Test Print`.
7. Buka `/pos`.
8. Pastikan `Settings POS` muncul untuk Owner/Admin.
9. Pastikan `Settings POS` tidak muncul saat login Kasir.

Saat shift berjalan:

1. Pantau Dashboard.
2. Pantau QR Order.
3. Pantau Kitchen.
4. Pantau Finance.
5. Cek Approvals jika ada request risiko tinggi.
6. Cek Audit jika ada transaksi mencurigakan.

Setelah shift:

1. Review closing shift.
2. Review selisih kas.
3. Review order void/reject.
4. Review audit log.
5. Catat issue pilot jika ada.

## 2. SOP Kasir POS

Awal shift:

1. Login dari `/pos-login`.
2. Buka shift.
3. Pastikan status shift `Open`.
4. Pastikan printer siap.
5. Pastikan QR Order badge muncul.
6. Pastikan menu produk tampil.

Transaksi dine-in:

1. Pilih meja.
2. Pilih item.
3. Pilih varian jika ada.
4. Cek cart.
5. Lookup member jika customer member.
6. Masukkan voucher jika ada.
7. Klik bayar.
8. Pilih metode pembayaran.
9. Pastikan uang/transfer/QRIS diterima.
10. Selesaikan payment.
11. Cetak struk.

QR order:

1. Buka QR Order.
2. Cek nomor meja.
3. Cek nama dan WhatsApp customer.
4. Cek item dan total.
5. Pilih:
   - `Accept` jika valid dan akan dibayar nanti.
   - `Paid` jika valid dan pembayaran sudah diterima.
   - `Reject` jika salah meja, prank, batal, atau tidak valid.
6. Pastikan order valid masuk Kitchen.
7. Jangan klik action berulang saat loading.

Akhir shift:

1. Pastikan tidak ada QR pending lama.
2. Pastikan transaksi sudah selesai.
3. Close shift.
4. Cocokkan cash fisik dengan expected cash.
5. Cetak/simpan report jika diperlukan.
6. Serahkan catatan ke supervisor/admin.

## 3. SOP Kitchen / Barista

Awal shift:

1. Login sebagai Kitchen/Barista/Koki.
2. Buka modul Kitchen.
3. Pastikan queue tampil.
4. Pastikan suara/notifikasi perangkat aktif jika dipakai.

Saat order masuk:

1. Baca nomor order dan meja.
2. Cek item.
3. Ubah status sesuai proses:
   - mulai proses.
   - ready.
   - delivered jika sudah diantar.
4. Prioritaskan order yang melewati SLA.
5. Laporkan item kosong ke kasir/admin.

Aturan:

- Kitchen hanya memproses order yang sudah divalidasi kasir.
- Jangan produksi order rejected.
- Jika ada order ganda, lapor admin sebelum proses.

## 4. SOP Finance / Closing

Saat shift:

1. Pantau cash session.
2. Pantau expense.
3. Pantau settlement non-cash.
4. Approve/reject expense sesuai aturan.

Closing:

1. Cek total penjualan.
2. Cek payment breakdown.
3. Cek cash fisik.
4. Cek selisih kas.
5. Jika selisih besar, buat catatan dan minta approval.
6. Export report jika diperlukan.
7. Review audit log.

## 5. SOP Jika Printer Bermasalah

Jika test print gagal:

1. Pastikan printer menyala.
2. Pastikan kertas ada.
3. Pastikan koneksi USB/Bluetooth aktif.
4. Test print dari Windows/Notepad.
5. Restart printer.
6. Restart Print Spooler Windows.
7. Cek nama printer di Pengaturan.
8. Klik `Test Print` ulang.

Jika tetap gagal:

1. Transaksi tetap boleh berjalan jika owner menyetujui manual receipt.
2. Catat order number.
3. Kirim invoice digital jika tersedia.
4. Laporkan ke admin.

## 6. SOP Jika Internet / LAN Bermasalah

Jika tablet tidak bisa buka POS:

1. Cek Wi-Fi.
2. Cek URL LAN.
3. Buka `/api/health` dari device.
4. Restart browser tablet.
5. Restart dev/server app jika perlu.

Jika HP customer tidak bisa scan QR:

1. Pastikan HP customer satu jaringan atau URL public bisa diakses.
2. Cek `GARAGE_PUBLIC_BASE_URL`.
3. Coba QR meja 01.
4. Jika tetap gagal, kasir input order manual di POS.

## 7. SOP Security

Wajib:

- Jangan berbagi akun Owner.
- Kasir memakai akun Kasir.
- Kitchen memakai akun Kitchen/Barista/Koki.
- Password seed harus diganti sebelum production.
- Jangan simpan API key di chat publik.
- Review audit log setelah pilot.

Larangan:

- Kasir tidak boleh mengubah Settings POS.
- Kasir tidak boleh mengubah Pengaturan outlet.
- Void/refund/expense besar harus melalui approval.

