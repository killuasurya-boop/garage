# 📘 BUKU PINTAR GARAGE OS
### Panduan Karyawan Garage Coffee & Motor

> Buku ini untuk SEMUA karyawan. Bahasa sederhana, langsung praktik. Owner bisa
> memberikan file ini ke karyawan baru sebagai panduan belajar mandiri.

---

## 1. Pengenalan GARAGE OS
GARAGE OS adalah aplikasi operasional Garage Coffee & Motor. Lewat satu aplikasi,
semua bagian bekerja terhubung:
- **Kasir** mencatat pesanan & pembayaran.
- **Barista & Koki** menerima pesanan otomatis di layar dapur/bar (KDS).
- **Waiter** mengantar pesanan yang sudah siap.
- **Finance** memantau uang masuk/keluar.
- **Manager & Owner** memantau semua dari dashboard.

Yang kamu lihat di aplikasi **menyesuaikan tugasmu** — kasir lihat menu jual,
barista lihat antrian minuman, dan seterusnya. Ini supaya tidak membingungkan.

---

## 2. Cara Login
1. Buka aplikasi (alamat dari owner, mis. `app.garagecoffee.id`).
2. Masukkan **email** dan **password** yang diberikan owner/manager.
3. Tekan **Masuk**.
4. Aplikasi langsung membuka modul utama sesuai jabatanmu (kasir → POS, dapur → KDS).

> Lupa password? Hubungi owner/manager — jangan buat akun sendiri.

## 3. Cara Logout
1. Klik **nama/akun** kamu (pojok atas).
2. Pilih **Keluar / Logout**.
3. Selalu logout di perangkat bersama (tablet kasir) setelah shift.

---

## 4. Panduan Kasir
**Tugas:** mencatat pesanan & menerima pembayaran.
1. Buka modul **POS**.
2. (Dine-in) Pilih **nomor meja**.
3. Klik menu untuk menambah ke keranjang. Pilih **varian** bila ada (mis. Coffee
   Cold/Hot, Nasi Goreng Sedang/Pedas).
4. Atur **jumlah (qty)**, tambah **catatan** bila perlu, atau **hapus** item.
5. Tekan **Bayar**. Di layar bayar: masukkan **voucher** / **diskon** (kalau ada),
   periksa rincian **Subtotal + Service + PB1 = Total**.
6. Pilih metode: **Cash** (masukkan uang diterima → kembalian otomatis) atau **QRIS**.
7. Tekan **Konfirmasi Bayar**. Struk muncul; pesanan otomatis terkirim ke dapur/bar.
8. (Opsional) Kirim **link tracking / invoice WhatsApp** ke pelanggan, atau unduh PDF.

> Minuman → masuk ke **Bar (Barista)**. Makanan/cemilan → masuk ke **Dapur (Koki)**.

## 5. Panduan Barista
**Tugas:** membuat minuman sesuai antrian.
1. Buka modul **Kitchen/KDS** (station Bar).
2. Lihat **antrian minuman**: nomor meja, item, dan **catatan pelanggan**.
3. Tekan **Mulai (cooking)** saat mengerjakan.
4. Tekan **Siap (ready)** kalau minuman selesai → waiter dapat notifikasi.
5. Status otomatis tersinkron ke kasir & owner. Barista **tidak bisa** melihat data keuangan.

## 6. Panduan Koki / Kitchen
**Tugas:** memasak makanan sesuai antrian.
1. Buka modul **Kitchen/KDS** (station Dapur).
2. Lihat **antrian makanan**: meja, menu, catatan (mis. "pedas sedang").
3. Tekan **Mulai** → **Siap** sesuai progres.
4. Saat **Siap**, waiter otomatis tahu untuk mengantar.
5. Urutan status tetap: **Antri → Dimasak → Siap → Diantar** (tidak bisa loncat/mundur).

## 7. Panduan Waiter
**Tugas:** mengantar pesanan & merapikan meja.
1. Buka modul **Waiter**.
2. Lihat **status meja** (kosong/terisi) dan pesanan yang **Siap** dari bar/dapur.
3. Antar ke meja, lalu tekan **Sudah diantar (delivered)**.
4. Status update otomatis ke kasir & owner.

## 8. Panduan Admin Finance
**Tugas:** memantau & mencatat keuangan.
1. Buka modul **Finance**.
2. Lihat **transaksi harian**, **metode pembayaran**, **omzet**.
3. **Input pengeluaran** bila ada belanja operasional.
4. Lihat **rekap harian/mingguan/bulanan**; export laporan bila tersedia.
5. Data penjualan kasir **otomatis** masuk ke finance & dashboard owner.
6. Finance **tidak bisa** mengubah pengaturan perusahaan milik owner.

## 9. Panduan Manager
**Tugas:** mengawasi operasional harian.
1. Buka **Dashboard** + modul operasional (POS, Kitchen, Waiter, Inventory, CRM, Approvals).
2. Pantau **order aktif, meja, staf, menu, stok**.
3. **Setujui/tolak** permintaan (mis. diskon besar) di modul **Approvals**.
4. Atur menu/promo bila diberi hak.
5. Manager fokus operasional — **Finance & payroll (Earnings) khusus Owner & Finance/CFO**.

## 10. Panduan Owner
**Tugas:** memantau seluruh bisnis dari satu layar.
1. Buka **Dashboard Owner** — pusat monitoring.
2. Lihat **omzet & transaksi hari ini, order aktif, status meja**.
3. Pantau **performa kasir/barista/dapur/waiter**, **menu terlaris**, **stok**.
4. Lihat **laporan finance**, **notifikasi penting**, dan **approval**.
5. Owner bisa membuka semua modul tanpa berganti akun.

---

## 11. Cara Membaca Dashboard
- **Kartu angka** di atas = ringkasan (omzet, transaksi, order aktif).
- **Warna**: hijau = baik, kuning/amber = perlu perhatian, merah = masalah.
- Klik kartu/grafik untuk detail. Data **real-time** (auto-refresh).

## 12. Cara Menangani Error Umum
| Masalah | Solusi cepat |
|---|---|
| Tidak bisa login | Cek email/password; pastikan internet; hubungi manager |
| "Pilih meja dulu" | Pilih nomor meja sebelum bayar (dine-in) |
| Pembayaran cash kurang | Masukkan uang diterima ≥ total |
| Diskon besar ditolak | Butuh **approval** supervisor/manager dulu |
| Layar dapur kosong | Pastikan kasir sudah konfirmasi bayar; refresh halaman |
| Aplikasi lambat | Cek koneksi internet; tunggu sinkronisasi; jangan klik bayar 2x |

## 13. Cara Input Order
Lihat **Panduan Kasir (Bab 4)**. Inti: pilih meja → tambah menu+varian → qty/catatan
→ Bayar → pilih metode → Konfirmasi.

## 14. Cara Update Status Order
- **Dapur/Bar:** Antri → **Mulai** → **Siap**.
- **Waiter:** Siap → **Sudah diantar**.
- Status tidak bisa diloncat atau dimundurkan (mencegah salah klik).

## 15. Cara Melihat Laporan
- **Finance/Owner:** modul Finance → pilih rentang tanggal → lihat omzet, metode bayar, pengeluaran, rekap.
- Export/print bila tombolnya tersedia.

## 16. Cara Menggunakan Pengaturan (Settings)
Khusus role berhak (Owner/Manager/Admin). Modul **Settings** mengatur:
profil bisnis, user & role, meja, menu & kategori, harga, **pajak/service charge**,
metode pembayaran, struk/printer, notifikasi, website. Ubah dengan hati-hati —
perubahan langsung berlaku ke seluruh aplikasi.

## 17. FAQ Karyawan
- **Kenapa menu saya beda dengan teman?** Tampilan menyesuaikan jabatan.
- **Bisa lihat gaji/keuangan?** Hanya role tertentu (Owner/Finance). Itu normal.
- **Salah klik status dapur?** Status tak bisa mundur; lapor manager bila perlu koreksi.
- **Pelanggan tanpa WhatsApp?** Tidak masalah — pembayaran tetap selesai.
- **Internet mati?** Selesaikan transaksi saat koneksi kembali; jangan klik bayar berkali-kali.

## 18. SOP Singkat Operasional Harian
1. Datang → **login** di perangkat tugasmu.
2. Kasir: **buka shift / kas awal**.
3. Jalankan tugas sesuai panduan role.
4. Jaga kebersihan data: catatan pesanan jelas, status tiket di-update tepat waktu.
5. Akhir shift: kasir **tutup shift / setor kas**; semua **logout**.

## 19. ✅ Checklist Buka Shift
- [ ] Login berhasil di perangkat
- [ ] (Kasir) Buka shift & isi **kas awal**
- [ ] Cek printer/struk & QRIS aktif
- [ ] Cek layar dapur/bar menyala & terhubung
- [ ] Cek stok bahan penting (lapor bila menipis)
- [ ] Siap melayani

## 20. ✅ Checklist Tutup Shift
- [ ] Selesaikan semua order aktif
- [ ] (Kasir) **Tutup shift** & hitung/setor kas (cocokkan dengan sistem)
- [ ] Bersihkan station & matikan peralatan
- [ ] Laporkan kendala ke manager
- [ ] **Logout** semua perangkat bersama

---

_Buku Pintar GARAGE OS — dokumen hidup. Bila ada fitur baru, minta owner/manager memperbarui panduan ini._
