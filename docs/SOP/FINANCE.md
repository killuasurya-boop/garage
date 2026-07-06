# SOP Finance / CFO

## Purpose

Pengendali kas, settlement, expense, invoice, dan closing.

## Role Objective

Menjalankan tanggung jawab harian sesuai role tanpa membuka data atau aksi yang bukan kewenangannya.

## Daily Responsibility

- Login dengan akun pribadi.
- Cek dashboard/module kerja sesuai role.
- Kerjakan ticket/transaksi/data hanya sampai batas tugas role.
- Laporkan anomali ke atasan langsung.
- Tutup pekerjaan dengan catatan shift atau handover.

## Allowed Access

Module/area berdasarkan source `role-access.ts`: dashboard, ai-agent, finance, earnings, approvals, audit, chat, training.

## Forbidden Actions

- Menggunakan akun orang lain.
- Mengubah transaksi, stok, payroll, atau setting tanpa mandat role.
- Membagikan data customer, staff, finance, atau file kandidat ke luar tim.
- Menekan approve/void/close jika data fisik belum cocok.

## Before Work

1. SCREEN: Login.
   ACTION: Masuk dengan email/password role.
   EXPECTED RESULT: Workspace terbuka dan sidebar hanya menampilkan menu yang diizinkan.
2. SCREEN: Module utama role.
   ACTION: Cek data awal shift, queue, atau laporan.
   EXPECTED RESULT: Tidak ada error akses atau data kritis kosong tanpa alasan.
3. SCREEN: Chat/Training.
   ACTION: Baca pengumuman dan SOP aktif.
   EXPECTED RESULT: Staff memahami prioritas shift.

## During Work

STEP 1
SCREEN: Module utama.
ACTION: Ambil pekerjaan paling prioritas.
EXPECTED RESULT: Ticket/transaksi/status mulai diproses.

STEP 2
SCREEN: Detail pekerjaan.
ACTION: Cek nomor meja/order, item, jumlah, status, dan catatan.
EXPECTED RESULT: Tidak ada salah meja, salah item, atau salah nominal.

STEP 3
SCREEN: Aksi status.
ACTION: Simpan perubahan hanya setelah pekerjaan fisik benar-benar selesai.
EXPECTED RESULT: Status berpindah dan tim berikutnya melihat update.

STEP 4
SCREEN: Chat/Internal note bila perlu.
ACTION: Eskalasi error, stok kosong, customer complaint, atau selisih kas.
EXPECTED RESULT: Manager/Admin menerima konteks lengkap.

## End Process

- Pastikan tidak ada pekerjaan pending pribadi.
- Tulis handover bila shift berganti.
- Logout dari device bersama.
- Laporkan error yang belum selesai.

## Start Shift SOP

- Cek perangkat, koneksi, dan akun.
- Buka module utama.
- Pastikan data hari ini tampil.
- Jika ada error database/backend, jangan input manual tanpa arahan manager.

## During Shift SOP

- Kerjakan dari antrian paling lama atau paling kritis.
- Gunakan status aplikasi sebagai catatan resmi.
- Jangan ubah data sensitif tanpa approval.

## End Shift SOP

- Selesaikan pending queue.
- Serahkan catatan exception.
- Logout.

## Escalation SOP

- Masalah customer: eskalasi ke Manager.
- Masalah uang/payment: eskalasi ke Finance/Owner.
- Masalah stok: eskalasi ke Gudang/Admin.
- Masalah sistem: eskalasi ke Admin/Owner.

## Emergency SOP

- Jika sistem down, catat order secara manual dengan nomor meja, jam, item, nominal, dan petugas.
- Saat sistem pulih, input ulang sesuai arahan Manager/Admin.
- Untuk finance, jangan close shift sebelum data manual direkonsiliasi.

## KPI

- Ketepatan status.
- Kecepatan menyelesaikan ticket/transaksi.
- Error input rendah.
- Handover jelas.
- Tidak ada akses/aksi di luar role.

## Common Mistakes

- Lupa refresh queue.
- Salah meja/order.
- Klik aksi dua kali.
- Menganggap data kosong sebagai tidak ada pekerjaan tanpa cek filter.
- Tidak mencatat exception.

## Troubleshooting

- Akses ditolak: cek role akun.
- Data tidak muncul: refresh, cek filter, cek outlet, cek `/api/health`.
- Gagal simpan: cek field wajib dan koneksi.
- Printer/payment error: ikuti SOP troubleshooting aplikasi.

## Shortcut Workflow

Login -> Module utama -> Ambil pekerjaan -> Cek detail -> Update status -> Catat exception -> Handover -> Logout.

## Review Required

Jika role ini tidak muncul eksplisit di `role-access.ts` atau tugasnya lintas departemen, manager harus menetapkan owner proses sebelum go-live.
