# GARAGE Operational Marketing Manifest

Manifest ini mencatat paket dokumen operasional-marketing GARAGE. Gunakan file ini untuk audit artefak, onboarding agent/tim baru, dan memastikan status kesiapan tidak diklaim tanpa evidence.

## 1. Paket Dokumen

| ID | Dokumen | Jenis | Owner | Status Awal | Fungsi |
| --- | --- | --- | --- | --- | --- |
| OM-001 | `docs/GARAGE-OPERATIONAL-MARKETING-START-HERE.md` | Runbook | Owner | Draft | Urutan eksekusi lintas tim |
| OM-002 | `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md` | Master checklist | Owner + semua lead | Draft | Status utama dan GO/NO-GO |
| OM-003 | `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md` | Worksheet | Owner + Marketing | Draft | Menu signature, promo, margin |
| OM-004 | `docs/GARAGE-WHATSAPP-ORDER-SOP.md` | SOP | Marketing + Kasir | Draft | Order dan komplain via WhatsApp |
| OM-005 | `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md` | Checklist | Marketing | Draft | Google Maps dan local SEO |
| OM-006 | `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md` | Calendar | Marketing | Draft | Konten 30 hari |
| OM-007 | `docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md` | Training checklist | Manager Operasional | Draft | Simulasi role dan sign-off staff |
| OM-008 | `docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md` | Report template | Owner + Manager | Draft | Laporan closing dan keputusan harian |

## 2. Dependensi Dokumen Lama

| Dokumen | Dipakai Untuk |
| --- | --- |
| `docs/PILOT_LAUNCH_CHECKLIST.md` | Fase pilot, training, dan operational launch |
| `docs/GO-LIVE-FINAL-CHECKLIST.md` | Gate teknis dan operational go-live |
| `docs/PILOT-ISSUE-LOG.md` | Issue log selama simulasi/soft launch |
| `docs/SOP-FINAL-OPERASIONAL-GARAGE.md` | SOP owner/admin/kasir/kitchen/finance |
| `docs/buku-pintar-panduan-sop-karyawan.md` | Buku kerja karyawan dan SOP dasar |
| `docs/garage-qr-cashier-sop.md` | SOP QR order kasir |
| `design-system/pages/landing.md` | Aturan landing page publik |

## 3. Status Readiness Saat Ini

Status paket dokumen: `Draft`.

Alasan:

- [ ] Belum ada evidence landing page desktop/mobile terbaru.
- [ ] Belum ada smoke test CTA WhatsApp/Maps terbaru.
- [ ] Belum ada bukti Google Maps profile final.
- [ ] Belum ada test order WA terbaru.
- [ ] Belum ada worksheet promo dengan HPP/base cost final.
- [ ] Belum ada sign-off training staff.
- [ ] Belum ada daily owner report dari closing soft launch.

Tidak boleh mengubah status ke `GO` sebelum evidence minimum di bawah terpenuhi.

## 4. Evidence Minimum

| Area | Evidence yang Harus Ada | File Tujuan |
| --- | --- | --- |
| Landing page | Screenshot desktop/mobile, CTA WA, CTA Maps, customer menu smoke | `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md` |
| Promo | HPP/base cost, margin, periode, owner approval, POS test | `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md` |
| WhatsApp | Screenshot test chat order, payment, ready, komplain | `docs/GARAGE-WHATSAPP-ORDER-SOP.md` |
| Google Maps | Screenshot profile dari HP, link Maps, link review | `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md` |
| Content | Foto/menu final, kalender 30 hari, CTA konsisten | `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md` |
| Staff | Simulasi SIM-001 sampai SIM-010, sign-off role kritis | `docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md` |
| Dashboard | Laporan owner harian dari data closing | `docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md` |
| Issue | Semua P0/P1/P2 tercatat dan punya owner | `docs/PILOT-ISSUE-LOG.md` |

## 5. Audit Commands

Jalankan dari root repo.

```powershell
git status --short
```

```powershell
$files = @(
  'docs\GARAGE-OPERATIONAL-MARKETING-START-HERE.md',
  'docs\GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md',
  'docs\GARAGE-PROMO-PROFIT-WORKSHEET.md',
  'docs\GARAGE-WHATSAPP-ORDER-SOP.md',
  'docs\GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md',
  'docs\GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md',
  'docs\GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md',
  'docs\GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md'
)
foreach ($file in $files) {
  if (Test-Path $file) { "OK $file" } else { "MISSING $file" }
}
```

```powershell
rg -n "sudah GO|dinyatakan GO|Status akhir" docs\GARAGE-*.md
```

Expected:

- Semua paket dokumen `OK`.
- Tidak ada klaim `sudah GO` di paket baru kecuali kalimat eksplisit bahwa dokumen belum menyatakan GARAGE GO.

## 6. Next Execution Order

1. Isi `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md` dengan menu nyata, HPP/base cost, dan owner approval.
2. Test `docs/GARAGE-WHATSAPP-ORDER-SOP.md` dengan chat nyata atau simulasi screenshot.
3. Isi `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md` dari HP customer.
4. Jalankan `docs/GARAGE-STAFF-SOFT-LAUNCH-TRAINING-CHECKLIST.md` untuk SIM-001 sampai SIM-010.
5. Isi `docs/GARAGE-DAILY-OWNER-REPORT-TEMPLATE.md` saat closing soft launch.
6. Update `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md` hanya setelah evidence terkumpul.

## 7. Ownership Rule

- Owner memutuskan `GO / CONDITIONAL / NO-GO`.
- Marketing tidak boleh publish promo tanpa margin approval.
- Kasir tidak boleh menandai paid tanpa bukti payment.
- Kitchen tidak boleh memproses order pending/rejected.
- Developer tidak boleh menaikkan status readiness tanpa smoke test/runtime evidence.
