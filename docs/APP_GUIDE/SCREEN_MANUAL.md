# APPLICATION MANUAL - Every Screen

## Login

Purpose: Masuk ke GarageOS dan POS.

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

Screenshot: [Screenshot placeholder - Login]

## OS Workspace

Purpose: Shell utama dengan sidebar role-aware.

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

Screenshot: [Screenshot placeholder - OS Workspace]

## Dashboard

Purpose: Ringkasan owner/manager.

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

## POS

Purpose: Transaksi kasir tablet.

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

Screenshot: [Screenshot placeholder - POS]

## Kitchen

Purpose: KDS produksi.

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

Screenshot: [Screenshot placeholder - Kitchen]

## Waiter

Purpose: Floor service dan meja.

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

Screenshot: [Screenshot placeholder - Waiter]

## Inventory

Purpose: Produk, stok, opname, transfer.

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

Screenshot: [Screenshot placeholder - Inventory]

## Finance

Purpose: Cash session, expense, settlement.

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

Screenshot: [Screenshot placeholder - Finance]

## CRM

Purpose: Customer, segment, points.

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

Screenshot: [Screenshot placeholder - CRM]

## Membership

Purpose: Member dashboard dan kartu.

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

Screenshot: [Screenshot placeholder - Membership]

## Marketing

Purpose: Campaign, broadcast, promo.

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

Screenshot: [Screenshot placeholder - Marketing]

## Approvals

Purpose: Keputusan risiko.

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

Screenshot: [Screenshot placeholder - Approvals]

## Website

Purpose: Landing hero dan info bisnis.

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

Screenshot: [Screenshot placeholder - Website]

## CEO Control

Purpose: Owner-only company vault.

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

Screenshot: [Screenshot placeholder - CEO Control]

## Earnings

Purpose: Fee staff dan payout.

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

Screenshot: [Screenshot placeholder - Earnings]

## Audit

Purpose: Audit log dan case.

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

Screenshot: [Screenshot placeholder - Audit]

## Team Management

Purpose: HR, staff, shift, SOP.

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

Screenshot: [Screenshot placeholder - Team Management]

## Settings

Purpose: Konfigurasi outlet/sistem.

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

Screenshot: [Screenshot placeholder - Settings]

## Training

Purpose: Buku Pintar dan SOP karyawan.

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

Screenshot: [Screenshot placeholder - Training]

## Recruitment

Purpose: Lamaran publik dan pipeline kandidat.

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

Screenshot: [Screenshot placeholder - Recruitment]

## Order Public

Purpose: Order customer via QR.

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

Screenshot: [Screenshot placeholder - Order Public]

## Display Queue

Purpose: Display antrian pelanggan.

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

Screenshot: [Screenshot placeholder - Display Queue]

## Invoice Live

Purpose: Status invoice/order publik.

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

Screenshot: [Screenshot placeholder - Invoice Live]
