# SOP Payroll Harian — Garage Coffee & Motor

## SOP untuk Supervisor Shift

### Pagi (08:45)
- [ ] Cek `/owner/attendance/live` — semua staff shift pagi sudah checkin?
- [ ] Kalau ada yang belum, hubungi via WA
- [ ] Set station split (Bar/Support/Kasir) — tulis di board

### Siang (12:00)
- [ ] Cek live board — kalau order timpang antar staff, tegur langsung

### Malam (22:30)
- [ ] Ingatkan semua staff untuk checkout sebelum 23:00
- [ ] Lupa checkout = Rp 0 hari itu (tidak bisa diperbaiki manual tanpa alasan kuat)

## SOP untuk Owner (Harian)

### Pagi
- [ ] Buka `/owner/payroll` — cek hasil finalisasi cron kemarin
- [ ] Kalau ada error di dashboard → jalankan **Finalisasi H-1** manual

### Sore
- [ ] Cek `/owner/payroll/requests` — approve payout yang layak
- [ ] Reject dengan alasan kalau ada red flag

## SOP untuk Owner (Bulanan)

### Tanggal 1
- [ ] Buka `/owner/payroll/reports?month=YYYY-MM` (bulan lalu)
- [ ] Bandingkan angka dengan perhitungan manual (spot check 2-3 staff)
- [ ] Kalau match → lanjutkan payout batch akhir bulan
- [ ] Simpan laporan PDF ke arsip

## SOP Insiden

### Cron 23:59 Gagal
1. Cek log VPS: `journalctl -u garage-payroll.service --since today`
2. Trigger manual: `tsx src/scripts/payroll-finalize-cli.ts --date=YYYY-MM-DD`
3. Kalau tetap error → cek `earnings_failed_queue` di DB
4. Lapor developer dengan screenshot error

### Staff Komplain Angka Wallet
1. Buka detail staff → cek riwayat harian
2. Buka `/api/wallet-fee/pool/YYYY-MM-DD` → tunjuk rincian pool + jam kerja
3. Kalau angka salah karena bug → owner adjust manual dengan alasan (audit)
4. Kalau angka benar (staff salah paham) → jelaskan rincian split

### GPS Palsu Terdeteksi
1. Cek foto selfie + koordinat di attendance log
2. Kalau jelas fake → set status invalid manual + potong bonus kehadiran
3. Peringatan tertulis ke staff

## Aturan Emas

> **Nol asumsi. Cek data, jangan hafalan.**
> Setiap komplain → buka dashboard, tunjuk angka, bukan menebak.
