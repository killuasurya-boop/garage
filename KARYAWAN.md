# Struktur Karyawan GARAGE / DESAIN AJA DULU

Dokumen ini menjadi acuan awal untuk struktur organisasi, pembagian tanggung jawab, dan level akses aplikasi GARAGE. Struktur dibuat praktis untuk operasional workshop, printshop, cashier, produksi, HR, finance, dan CRM.

## 1. Struktur Organisasi

```text
CEO / Owner
|
+-- General Manager / Operational Manager
|   |
|   +-- Admin Operasional
|   |   +-- Input order
|   |   +-- Data customer
|   |   +-- Follow-up WhatsApp
|   |   +-- Arsip invoice dan dokumen
|   |
|   +-- Kasir
|   |   +-- Terima pembayaran
|   |   +-- Cetak struk
|   |   +-- Cek lunas / belum bayar
|   |   +-- Tutup shift kas
|   |
|   +-- Waiter / Customer Service
|   |   +-- Terima customer
|   |   +-- Input pesanan awal
|   |   +-- Update status meja / order
|   |   +-- Handoff ke kasir
|   |
|   +-- Kepala Produksi
|   |   |
|   |   +-- Desainer
|   |   |   +-- Buat desain
|   |   |   +-- Revisi
|   |   |   +-- ACC desain customer
|   |   |
|   |   +-- Operator Cetak
|   |   |   +-- Proses cetak
|   |   |   +-- Update produksi
|   |   |   +-- Catat pemakaian bahan / stok
|   |   |
|   |   +-- QC / Finishing
|   |       +-- Cek hasil
|   |       +-- Finishing
|   |       +-- Packing
|   |       +-- Siap ambil / siap kirim
|   |
|   +-- Kurir / Delivery
|       +-- Antar pesanan
|       +-- Update status terkirim
|
+-- Finance / Accounting
|   +-- Rekap omzet
|   +-- Piutang
|   +-- Pengeluaran
|   +-- Margin / HPP
|   +-- Laporan owner
|
+-- HR / SDM
|   +-- Akun karyawan
|   +-- Absensi
|   +-- Shift
|   +-- Izin / cuti
|   +-- Evaluasi performa
|
+-- Marketing / CRM
    +-- Promo
    +-- Follow-up customer lama
    +-- Membership
    +-- Broadcast WhatsApp
    +-- Retensi customer
```

## 2. Role Utama Aplikasi

| Role | Fungsi Utama | Prioritas MVP |
| --- | --- | --- |
| Owner / CEO | Kontrol penuh bisnis, laporan, setting, override | Wajib |
| Manager | Kontrol operasional harian dan monitoring tim | Wajib |
| Admin | Order, customer, produk, follow-up, dokumen | Wajib |
| Kasir | Pembayaran, struk, tagihan, tutup shift | Wajib |
| Waiter / CS | Customer masuk, meja, order awal, handoff kasir | Wajib untuk outlet/meja |
| Desainer | Antrian desain, revisi, ACC desain | Wajib |
| Operator Cetak | Antrian produksi, status cetak, stok bahan | Wajib |
| QC / Finishing | Cek hasil, finishing, packing, siap kirim | Penting |
| Kurir / Delivery | Pengiriman dan status terkirim | Opsional awal |
| Finance | Omzet, piutang, pengeluaran, laporan keuangan | Penting |
| HR / SDM | Karyawan, absensi, shift, performa | Penting |
| Marketing / CRM | Promo, membership, follow-up, broadcast | Penting setelah data customer rapi |

## 3. Level Akses Aplikasi

| Level Akses | Hak Akses |
| --- | --- |
| Owner | Semua akses: dashboard, order, kasir, finance, HR, setting, user, audit, override |
| Manager | Operasional, laporan, monitoring tim, approval tertentu, tanpa setting sensitif owner |
| Admin | Order, customer, produk, follow-up, dokumen, laporan operasional terbatas |
| Kasir | Pembayaran, tagihan, struk, customer lookup, shift kasir, laporan kasir terbatas |
| Waiter / CS | Meja, input order awal, status layanan, request bill, handoff kasir |
| Desainer | Queue desain, upload mockup, revisi, ACC desain, catatan desain |
| Produksi | Queue produksi, update status cetak, pemakaian bahan, kendala produksi |
| QC | QC hasil, status finishing, packing, siap ambil, siap kirim |
| Kurir | Daftar pengiriman, status keluar, status terkirim |
| Finance | Omzet, cashflow, piutang, pengeluaran, HPP, margin, laporan finance |
| HR | User karyawan, absensi, shift, izin, performa staff |
| Marketing | Customer, segmentasi, promo, membership, broadcast, follow-up |

## 4. Tanggung Jawab Per Divisi

### CEO / Owner

- Menentukan arah bisnis.
- Melihat laporan omzet, margin, piutang, dan performa tim.
- Menyetujui perubahan besar pada harga, produk, akses user, dan setting aplikasi.
- Mengambil keputusan untuk ekspansi, promosi, rekrutmen, dan investasi alat.

### General Manager / Operational Manager

- Menjaga operasional harian berjalan.
- Memastikan order masuk, diproduksi, selesai, dan dibayar.
- Mengawasi admin, kasir, waiter, desain, produksi, QC, dan delivery.
- Menangani eskalasi customer dan keterlambatan produksi.

### Admin Operasional

- Membuat dan memperbarui data order.
- Menjaga data customer rapi.
- Melakukan follow-up customer.
- Mengarsipkan dokumen, invoice, dan catatan order.

### Kasir

- Memproses pembayaran.
- Membedakan status lunas, belum bayar, DP, dan piutang.
- Mencetak struk.
- Menutup shift kasir dan mencocokkan uang fisik dengan sistem.

### Waiter / Customer Service

- Menerima customer yang datang.
- Membantu input order awal.
- Mengelola status meja atau layanan.
- Mengirim order ke kasir / produksi sesuai alur.

### Desainer

- Mengerjakan desain sesuai brief order.
- Mengelola revisi.
- Mengupload mockup atau file desain.
- Menandai desain sudah ACC sebelum produksi.

### Operator Cetak

- Mengerjakan order yang sudah siap produksi.
- Mengupdate status proses cetak.
- Mencatat kendala alat, bahan, atau file.
- Mengurangi stok bahan jika sistem stok sudah aktif.

### QC / Finishing

- Mengecek hasil produksi.
- Menandai hasil lolos QC atau perlu ulang.
- Melakukan finishing, packing, dan label siap ambil / siap kirim.

### Finance

- Mengecek cash in dan cash out.
- Mengontrol piutang.
- Membuat laporan omzet, HPP, margin, dan pengeluaran.
- Memberi data ke owner untuk keputusan bisnis.

### HR / SDM

- Mengelola akun karyawan.
- Mengatur role dan akses.
- Memantau absensi, shift, dan kedisiplinan.
- Menyusun evaluasi performa staff.

### Marketing / CRM

- Mengelola promo.
- Mengelompokkan customer.
- Melakukan follow-up customer lama.
- Menjalankan membership dan broadcast secara terkontrol.

## 5. KPI Dasar Per Role

| Role | KPI Dasar |
| --- | --- |
| Owner | Omzet, margin, cashflow, pertumbuhan customer, risiko operasional |
| Manager | Order selesai tepat waktu, keterlambatan, komplain, produktivitas tim |
| Admin | Order valid, data customer lengkap, follow-up selesai |
| Kasir | Pembayaran akurat, selisih kas, tagihan pending, struk valid |
| Waiter / CS | Customer tertangani, order masuk benar, handoff lancar |
| Desainer | Desain selesai, jumlah revisi, desain overdue, ACC customer |
| Operator Cetak | Produksi selesai, kendala produksi, reprint, pemakaian bahan |
| QC | Hasil lolos QC, barang siap ambil/kirim, rework |
| Finance | Piutang turun, laporan tepat waktu, margin terbaca |
| HR | Absensi rapi, shift tertib, akun staff aman |
| Marketing | Repeat order, customer aktif, promo berhasil, follow-up selesai |

## 6. Rekomendasi Implementasi Bertahap

### Fase 1 - Wajib MVP

- Owner
- Admin
- Kasir
- Waiter / CS
- Desainer
- Operator Cetak
- QC

Fokus fase ini adalah order masuk, pembayaran aman, produksi berjalan, dan status order terlihat jelas.

### Fase 2 - Kontrol Operasional

- Manager
- Finance
- HR

Fokus fase ini adalah laporan, absensi, shift, user access, cashflow, dan piutang.

### Fase 3 - Growth dan Retensi

- Marketing / CRM
- Kurir / Delivery

Fokus fase ini adalah customer retention, membership, promo, broadcast, dan pengiriman yang lebih rapi.

## 7. Aturan Penting

- Owner harus punya akses penuh dan bisa override.
- Staff hanya boleh melihat menu yang sesuai pekerjaannya.
- User yang sudah punya histori transaksi sebaiknya dinonaktifkan, bukan dihapus.
- Perubahan penting harus tercatat: user, role, pembayaran, stok, order, dan setting.
- Role finance dan HR jangan otomatis diberi akses penuh ke semua setting owner.
- Kasir harus selalu punya indikator pembayaran yang jelas: lunas, belum bayar, DP, piutang.
- Produksi hanya memproses order yang sudah valid dan desainnya sudah siap / ACC jika dibutuhkan.

