## Dashboard

Purpose: Melihat KPI, alert, revenue, order aktif, dan owner/manager snapshot.

Who Uses: lihat role matrix dan sidebar sesuai akun.

Buttons:
- Create: tersedia bila layar memiliki aksi tambah data dan role punya permission tulis.
- Edit: tersedia pada data operasional tertentu seperti produk, staff, campaign, atau setting.
- Delete: terbatas pada role owner/admin/permission tulis; gunakan hanya jika benar-benar perlu.
- Export: tersedia di finance, inventory audit, owner daily brief, payroll, dan beberapa laporan.
- Filter: tersedia pada layar list/table seperti inventory, finance, CRM, audit, recruitment.

Field Explanation:
- Field utama mengikuti label di layar. Data uang harus dicek dua kali sebelum submit.
- Field status menentukan alur kerja berikutnya. Jangan ubah status jika pekerjaan fisik belum selesai.

Example Data:
- Order: T-01, Americano Cold x1, QRIS.
- Produk: COF-001, Americano, Coffee, promo aktif bila ada.
- Staff: Nama, role, outlet, shift.

Common Error:
- Akses ditolak berarti role tidak punya izin.
- Data kosong berarti filter terlalu sempit, outlet salah, atau backend/database belum siap.
- Gagal simpan biasanya karena field wajib kosong, format salah, atau koneksi putus.

Recovery:
- Refresh halaman.
- Cek koneksi dan `/api/health`.
- Hubungi Manager/Admin jika error berulang.

Best Practice:
- Gunakan filter sebelum mencari manual.
- Kerjakan satu transaksi/ticket sampai selesai.
- Jangan klik tombol aksi berulang saat loading.

Estimated Time: 30 detik - 5 menit, tergantung tugas.

Screenshot: [Screenshot placeholder - Dashboard]
