# Fitur Pengaturan - MVP Master Profesional

Dokumen ini menjadi acuan final untuk fitur **Pengaturan** pada Garage Digital Ecosystem. Fokusnya adalah memastikan fitur Pengaturan siap dipakai sebagai pusat konfigurasi outlet, mudah dipahami owner/admin, aman untuk operasional, dan cukup kuat untuk MVP production.

## 1. Tujuan Fitur

Fitur Pengaturan berfungsi sebagai pusat kontrol konfigurasi outlet. Semua nilai penting yang memengaruhi transaksi, struk, approval, notifikasi, printer, dan loyalty bisa diatur dari satu tempat tanpa mengubah kode.

Tujuan utama:

- Mengurangi hardcode konfigurasi operasional.
- Memudahkan owner/admin mengatur aturan outlet.
- Menjaga konsistensi hitungan POS, pajak, service charge, dan loyalty.
- Membuat perubahan pengaturan tercatat di audit log.
- Menyiapkan fondasi multi-outlet karena settings disimpan per outlet.

## 2. Status Saat Ini

Fitur Pengaturan sudah tersedia di modul:

- Route OS: `/os?module=settings`
- API read: `GET /api/settings`
- API update: `PATCH /api/settings`
- Storage database: tabel `app_settings`
- Service: `getAppSettings()` dan `updateAppSettings()` di `src/lib/garage-service.ts`
- UI: `SettingsView` di `src/components/garage/garage-app.tsx`

Status implementasi:

- Sudah punya tab UI.
- Sudah punya default settings.
- Sudah validasi input API dengan Zod.
- Sudah menyimpan settings per outlet.
- Sudah mencatat audit log saat update.
- Sudah ada mode read-only untuk role yang tidak boleh edit.
- Sudah ada tombol reset field ke default.
- Sudah ada notifikasi sukses/error.

Kesimpulan: fitur sudah layak sebagai MVP, tetapi masih perlu beberapa penyempurnaan kecil agar lebih profesional untuk operasional harian.

## 3. Hak Akses

### Read

Endpoint `GET /api/settings` membutuhkan permission:

- `dashboard:read`

Artinya role yang punya akses dashboard bisa membaca settings.

### Write

Endpoint `PATCH /api/settings` membutuhkan permission:

- `finance:write`

Di UI, role yang bisa edit:

- Owner / CEO
- Admin
- Manager Operasional
- Finance / CFO

Role lain hanya read-only.

### Saran Profesional

Untuk MVP final, aturan akses ini sudah cukup, tetapi lebih rapi jika dibuat permission khusus:

- `settings:read`
- `settings:write`

Alasannya:

- Pengaturan bukan murni finance.
- Manager Operasional perlu edit setting operasional tanpa otomatis dianggap finance.
- Di masa depan, sebagian setting bisa hanya boleh diedit owner.

Rekomendasi MVP:

- Tetap gunakan permission saat ini agar tidak memperbesar scope.
- Tambahkan catatan roadmap untuk permission khusus settings.

## 4. Struktur Tab Pengaturan

Fitur Pengaturan saat ini dibagi menjadi 6 tab.

### 4.1 POS Billing

Field:

- Service Charge (%)
- PB1 / Pajak Restoran (%)
- Max Diskon Kasir (%)
- Receipt History Max

Fungsi:

- Mengatur komponen perhitungan transaksi.
- Membatasi diskon manual kasir.
- Mengatur jumlah histori struk yang bisa direprint di device.

Default:

- Service Charge: 5%
- Tax / PB1: 10%
- Max diskon kasir: 50%
- Receipt history max: 20

Saran:

- Tampilkan preview simulasi total bill.
- Contoh: subtotal Rp 100.000, service 5%, tax 10%, total Rp 115.500.
- Tambahkan label bahwa pajak dihitung dari subtotal + service.

Prioritas:

- MVP nice-to-have.

### 4.2 Approval

Field:

- Threshold Approval Expense (Rp)

Fungsi:

- Menentukan batas nominal expense yang wajib masuk approval manager.

Default:

- Rp 1.000.000

Saran:

- Tambahkan helper text yang lebih jelas:
  - Expense di bawah threshold bisa langsung tercatat.
  - Expense sama dengan atau di atas threshold wajib approval.
- Di masa depan, pisahkan threshold untuk:
  - Expense
  - Void
  - Refund
  - Diskon besar
  - Stock adjustment

Prioritas:

- MVP cukup.
- Phase 2 untuk approval matrix.

### 4.3 Branding

Field:

- Nama Brand
- Tagline
- Alamat Outlet
- No. Telp Outlet
- NPWP
- Footer Struk

Fungsi:

- Mengatur identitas outlet di struk.
- Menyiapkan struk agar layak untuk customer corporate.

Default:

- Brand: GARAGE
- Tagline: Coffee & Motor
- Footer: TERIMA KASIH
- Alamat, telepon, NPWP: kosong

Saran:

- Tambahkan preview struk kecil di sisi kanan.
- Validasi format nomor telepon Indonesia.
- Validasi format NPWP ringan.
- Tambahkan upload logo struk jika thermal printer mendukung image print.

Prioritas:

- Preview struk: penting untuk profesional.
- Validasi format: nice-to-have.
- Upload logo thermal: phase 2.

### 4.4 Notifikasi

Field:

- Approval Polling Interval (detik)
- Sound QR Order Masuk
- Auto-Print Struk Setelah Bayar

Fungsi:

- Mengatur frekuensi refresh approval badge.
- Mengaktifkan suara saat QR order masuk.
- Mengaktifkan cetak otomatis setelah payment.

Default:

- Approval polling: 60 detik
- QR sound: true
- Auto print receipt: true

Saran:

- Tambahkan tombol test sound.
- Tambahkan tombol test auto-print dummy receipt.
- Tampilkan peringatan bahwa auto-print membutuhkan print server aktif.

Prioritas:

- Test sound: MVP profesional.
- Test printer: MVP profesional jika print server sudah stabil.

### 4.5 Printer

Field:

- Nama Printer Default
- Copies per Struk

Fungsi:

- Menentukan printer thermal default.
- Mengatur jumlah copy struk.

Default:

- Printer name: kosong / auto-detect
- Copies: 1

Saran:

- Tambahkan status koneksi print server.
- Tambahkan daftar printer terdeteksi.
- Tambahkan tombol test print.
- Tambahkan fallback jika printer tidak ditemukan.

Prioritas:

- Status print server dan test print sangat disarankan sebelum pilot outlet.

### 4.6 Loyalty

Field:

- Poin per Rp 1.000
- Max Discount Voucher (%)

Fungsi:

- Mengatur earning point member.
- Mengatur batas diskon voucher persen.

Default:

- Poin per Rp 1.000: 1
- Max discount voucher: 30%

Saran:

- Tampilkan simulasi poin.
- Contoh: belanja Rp 50.000 = 50 poin sebelum multiplier tier.
- Tambahkan catatan bahwa tier member punya multiplier.
- Tambahkan pengaturan redemption rate di masa depan.

Prioritas:

- Simulasi poin: MVP nice-to-have.
- Redemption rate setting: phase 2.

## 5. API Contract

### GET /api/settings

Permission:

- `dashboard:read`

Response:

```json
{
  "success": true,
  "data": {
    "settings": {
      "serviceChargePct": 5,
      "taxPct": 10,
      "manualDiscountMaxPct": 50,
      "receiptHistoryMax": 20,
      "expenseApprovalThreshold": 1000000,
      "brandName": "GARAGE",
      "brandTagline": "Coffee & Motor",
      "receiptFooter": "TERIMA KASIH",
      "outletAddress": "",
      "outletPhone": "",
      "npwp": "",
      "approvalPollIntervalSec": 60,
      "qrSoundOn": true,
      "autoPrintReceipt": true,
      "defaultPrinterName": "",
      "receiptCopies": 1,
      "pointsPerThousand": 1,
      "voucherMaxDiscountPct": 30
    },
    "defaults": {}
  }
}
```

### PATCH /api/settings

Permission:

- `finance:write`

Body:

Semua field optional. Kirim hanya field yang berubah.

Contoh:

```json
{
  "serviceChargePct": 7.5,
  "taxPct": 10,
  "receiptFooter": "TERIMA KASIH, DATANG KEMBALI"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "settings": {}
  }
}
```

## 6. Validasi Field

| Field | Tipe | Validasi |
| --- | --- | --- |
| `serviceChargePct` | number | 0-50 |
| `taxPct` | number | 0-50 |
| `manualDiscountMaxPct` | number | 0-100 |
| `receiptHistoryMax` | integer | 5-200 |
| `expenseApprovalThreshold` | integer | 0-1.000.000.000 |
| `brandName` | string | wajib, max 40 |
| `brandTagline` | string | max 60 |
| `receiptFooter` | string | max 120 |
| `outletAddress` | string | max 200 |
| `outletPhone` | string | max 40 |
| `npwp` | string | max 40 |
| `approvalPollIntervalSec` | integer | 10-600 |
| `qrSoundOn` | boolean | true/false |
| `autoPrintReceipt` | boolean | true/false |
| `defaultPrinterName` | string | max 80 |
| `receiptCopies` | integer | 1-5 |
| `pointsPerThousand` | number | 0-10 |
| `voucherMaxDiscountPct` | number | 0-100 |

## 7. Database

Tabel:

- `app_settings`

Model penyimpanan:

- Key-value per outlet.
- Jika row belum ada, sistem memakai default dari `DEFAULT_APP_SETTINGS`.
- Saat update, sistem melakukan insert atau update berdasarkan outlet dan key.

Kelebihan:

- Fleksibel untuk menambah setting baru.
- Cocok untuk multi-outlet.
- Default aman jika database belum punya row.

Hal yang perlu dijaga:

- Jangan rename key sembarangan karena bisa memutus setting lama.
- Jika menambah field baru, wajib update:
  - Type `AppSettings`
  - `DEFAULT_APP_SETTINGS`
  - Zod schema di `/api/settings`
  - UI `SettingsView`
  - Dokumentasi ini

## 8. Audit Log

Saat settings diubah, sistem mencatat audit log:

- Actor
- Action: `App settings updated`
- Object: outlet aktif atau global
- Device
- Metadata berisi daftar key yang berubah dan outlet id

Saran:

- Tampilkan detail before/after di metadata.
- Tambahkan tampilan riwayat perubahan settings di UI.
- Beri tombol restore ke versi sebelumnya.

Prioritas:

- Before/after metadata: disarankan untuk MVP final.
- Riwayat dan restore: phase 2.

## 9. Risiko Operasional

Risiko:

- Pajak/service charge salah bisa membuat total bill salah.
- Auto-print aktif tapi printer mati bisa membuat kasir bingung.
- Threshold approval terlalu tinggi bisa melemahkan kontrol expense.
- Max diskon terlalu besar membuka risiko fraud.
- Poin loyalty terlalu besar bisa menggerus margin.

Mitigasi:

- Validasi angka minimum/maksimum.
- Audit log setiap perubahan.
- Batasi edit hanya role terpercaya.
- Tambahkan preview/simulasi sebelum simpan.
- Tambahkan konfirmasi untuk field risiko tinggi.

Field risiko tinggi:

- `taxPct`
- `serviceChargePct`
- `manualDiscountMaxPct`
- `expenseApprovalThreshold`
- `pointsPerThousand`
- `voucherMaxDiscountPct`
- `autoPrintReceipt`

## 10. Saran Final MVP Profesional

Berikut saran paling penting agar fitur Pengaturan terasa selesai dan siap pilot:

### Wajib Sebelum Pilot

1. Tambahkan status print server di tab Printer.
2. Tambahkan tombol test print.
3. Tambahkan tombol test sound di tab Notifikasi.
4. Tambahkan preview hitungan POS di tab POS Billing.
5. Tambahkan preview struk di tab Branding.
6. Tambahkan metadata before/after saat audit log settings.
7. Tambahkan konfirmasi saat mengubah field risiko tinggi.
8. Pastikan semua nilai settings benar-benar dipakai oleh POS, receipt, loyalty, dan finance.

### Bisa Masuk Phase 2

1. Permission khusus `settings:read` dan `settings:write`.
2. Approval matrix lebih detail.
3. Riwayat perubahan settings di UI.
4. Restore setting versi sebelumnya.
5. Export/import setting outlet.
6. Template setting per outlet.
7. Multi-outlet bulk apply.
8. Upload logo struk thermal.
9. Validasi format NPWP dan telepon.
10. Redemption rate loyalty bisa diatur.

## 11. Acceptance Criteria

Fitur Pengaturan dianggap selesai untuk MVP jika:

- Owner/Admin/Manager/Finance bisa membuka modul Pengaturan.
- Role tanpa akses edit melihat mode read-only.
- Settings berhasil dimuat dari API.
- Default settings muncul jika database belum punya row.
- Perubahan field tersimpan ke database.
- UI menampilkan state dirty saat ada perubahan.
- Tombol batal menghapus draft perubahan.
- Tombol reset field mengembalikan ke default.
- API menolak input di luar batas validasi.
- API menolak user tanpa permission write.
- Audit log tercatat setiap update.
- Setting pajak/service/loyalty/printer dipakai oleh fitur operasional terkait.
- Error state tampil jika load/save gagal.
- Tidak ada reload penuh halaman saat menyimpan.

## 12. Test Case Manual

### Load Settings

1. Login sebagai Owner.
2. Buka `/os?module=settings`.
3. Pastikan 6 tab muncul.
4. Pastikan nilai default muncul.

Expected:

- Settings tampil tanpa error.

### Update POS Billing

1. Ubah service charge dari 5 ke 7.5.
2. Klik simpan.
3. Refresh halaman.

Expected:

- Nilai tetap 7.5.
- Audit log tercatat.

### Role Read-Only

1. Login sebagai role yang tidak boleh edit.
2. Buka modul Pengaturan jika tersedia.

Expected:

- Muncul alert read-only.
- Field disabled.
- Tombol simpan tidak tersedia.

### Validasi API

1. Kirim PATCH `taxPct: 99`.

Expected:

- API menolak karena max 50.

### Reset Field

1. Ubah footer struk.
2. Klik reset field.

Expected:

- Field kembali ke default.
- Perubahan masuk draft sampai disimpan.

### Printer

1. Isi nama printer default.
2. Simpan.
3. Lakukan transaksi POS.

Expected:

- Sistem memakai printer sesuai setting jika print server mendukung.

### Loyalty

1. Ubah poin per Rp 1.000.
2. Simpan.
3. Buat transaksi member.

Expected:

- Poin mengikuti nilai settings.

## 13. Rekomendasi UI Final

Layout ideal:

- Header:
  - Judul `Pengaturan`
  - Outlet aktif
  - Badge status `Unsaved changes`
  - Tombol `Batal`
  - Tombol `Simpan`

- Sidebar/tab:
  - POS Billing
  - Approval
  - Branding
  - Notifikasi
  - Printer
  - Loyalty

- Panel kanan opsional:
  - Preview bill untuk POS Billing
  - Preview struk untuk Branding
  - Status printer untuk Printer
  - Simulasi poin untuk Loyalty

Microcopy yang disarankan:

- `Perubahan berlaku untuk outlet aktif.`
- `Field bertanda risiko tinggi dapat memengaruhi transaksi dan laporan.`
- `Auto-print membutuhkan print server aktif di perangkat kasir.`
- `Pajak dihitung setelah subtotal dan service charge.`

## 14. Checklist Developer Jika Menambah Setting Baru

1. Tambahkan field ke type `AppSettings`.
2. Tambahkan default ke `DEFAULT_APP_SETTINGS`.
3. Tambahkan validasi ke `patchSchema` di `/api/settings`.
4. Tambahkan field di UI `SettingsView`.
5. Tentukan tab yang tepat.
6. Pastikan setting dipakai di logic bisnis.
7. Tambahkan audit metadata jika field risiko tinggi.
8. Update dokumen ini.
9. Test GET dan PATCH.
10. Test role read-only dan role write.

## 15. Kesimpulan Final

Fitur Pengaturan sudah memiliki pondasi MVP yang baik: UI tersedia, API tersedia, validasi ada, database per outlet sudah siap, dan audit log sudah berjalan.

Untuk membuatnya benar-benar profesional sebelum dipakai operasional outlet, prioritas utama adalah memperkuat pengalaman pengguna dan kontrol risiko:

- Preview hitungan POS.
- Preview struk.
- Test sound.
- Test print dan status print server.
- Audit before/after.
- Konfirmasi field risiko tinggi.

Dengan tambahan tersebut, fitur Pengaturan akan menjadi pusat konfigurasi outlet yang aman, jelas, dan siap mendukung operasional harian Garage Coffee & Motor.

