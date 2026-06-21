# GARAGE Staff Soft Launch Training Checklist

Checklist ini dipakai sebelum GARAGE menjalankan soft launch dan campaign publik. Fokusnya bukan teori SOP, tetapi pembuktian bahwa staff bisa menjalankan skenario real dari customer datang sampai closing.

## 1. Prasyarat Training

- [ ] Role staff final.
- [ ] Akun staff dibuat di GARAGE OS.
- [ ] Password default diganti.
- [ ] Jadwal shift soft launch disetujui.
- [ ] Menu final tersedia di POS.
- [ ] Promo yang akan dipakai sudah lolos `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md`.
- [ ] WhatsApp order SOP tersedia.
- [ ] QR table/order flow tersedia.
- [ ] Printer/receipt flow diketahui.
- [ ] Issue log tersedia: `docs/PILOT-ISSUE-LOG.md`.

## 2. Role yang Harus Dilatih

| Role | Training Wajib | Trainer | Status | Catatan |
| --- | --- | --- | --- | --- |
| Owner | Dashboard, approval, issue review, promo decision | Developer/Manager | Draft |  |
| Manager Operasional | Shift control, escalation, staff handover | Owner | Draft |  |
| Kasir | POS, payment, QR, WA order, promo, closing | Manager | Draft |  |
| Barista/Kitchen | KDS/ticket, status order, item kosong | Manager/Kasir | Draft |  |
| Waiter | table flow, customer help, komplain awal | Manager | Draft |  |
| Marketing | WA, Maps, content, promo rules | Owner | Draft |  |
| Inventory/Gudang | stok, item kosong, reorder note | Manager | Draft |  |

Status:

- `Draft`: belum dilatih.
- `Practiced`: sudah latihan, belum diuji.
- `Pass`: lulus simulasi.
- `Needs Retry`: perlu latihan ulang.
- `Blocked`: perlu fix sistem/keputusan owner.

## 3. Modul Training

### Owner / Manager

- [ ] Login owner/admin.
- [ ] Buka dashboard operasional.
- [ ] Cek transaksi hari ini.
- [ ] Cek pending QR/WA issue.
- [ ] Cek void/refund/discount.
- [ ] Cek audit log.
- [ ] Approve/reject kasus promo/refund.
- [ ] Review issue log.
- [ ] Putuskan GO/CONDITIONAL/NO-GO harian.

### Kasir

- [ ] Login POS.
- [ ] Open shift.
- [ ] Input walk-in order.
- [ ] Input takeaway order.
- [ ] Terima QR order.
- [ ] Terima WA order dan input ke POS.
- [ ] Terapkan promo/voucher sesuai aturan.
- [ ] Proses cash.
- [ ] Proses QRIS/transfer manual sesuai SOP.
- [ ] Cetak/kirim receipt.
- [ ] Reject order salah/prank.
- [ ] Void/refund dengan approval.
- [ ] Close shift.
- [ ] Buat catatan closing.

### Barista / Kitchen

- [ ] Login kitchen/KDS.
- [ ] Terima ticket valid.
- [ ] Update status proses.
- [ ] Tandai ready/delivered.
- [ ] Laporkan item kosong ke kasir.
- [ ] Tangani order prioritas/SLA lama.
- [ ] Tidak memproses order rejected/pending.

### Waiter / Front Area

- [ ] Sambut customer.
- [ ] Arahkan customer ke QR/menu/WA sesuai konteks.
- [ ] Bantu customer scan QR.
- [ ] Konfirmasi nomor meja.
- [ ] Antar order sesuai meja.
- [ ] Catat komplain awal.
- [ ] Eskalasi komplain ke manager.
- [ ] Reset meja setelah selesai.

### Marketing / Admin Channel

- [ ] Cek landing page CTA.
- [ ] Cek link WhatsApp.
- [ ] Cek Google Maps.
- [ ] Balas WA order pakai template.
- [ ] Balas komplain WA pakai SOP.
- [ ] Minta review Google Maps setelah order selesai.
- [ ] Pastikan konten promo sesuai worksheet margin.
- [ ] Catat order/feedback dari campaign.

## 4. Skenario Simulasi Wajib

Jalankan semua skenario sebelum campaign publik.

| ID | Skenario | Role | Expected | Result | Evidence | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| SIM-001 | Walk-in cash order | Kasir + Kitchen | Order masuk, paid, ticket selesai |  |  | Manager |
| SIM-002 | Dine-in QR order | Customer + Kasir + Kitchen | QR diterima, validasi, kitchen ticket |  |  | Manager |
| SIM-003 | Takeaway WA order | Marketing/Kasir | Chat dibalas, order masuk POS, pickup jelas |  |  | Manager |
| SIM-004 | Promo order | Kasir | Promo sesuai aturan dan tercatat |  |  | Owner |
| SIM-005 | Item out-of-stock | Kitchen + Kasir | Customer diberi alternatif, POS/menu ditangani |  |  | Manager |
| SIM-006 | Order salah meja | Kasir + Waiter | Ditahan/reject, tidak masuk produksi salah |  |  | Manager |
| SIM-007 | Payment QRIS/transfer manual | Kasir | Bukti dicek sebelum paid |  |  | Manager |
| SIM-008 | Komplain order lambat | Waiter + Manager | Acknowledge, estimasi baru, issue dicatat |  |  | Manager |
| SIM-009 | Refund/void | Kasir + Owner | Approval jelas, audit tercatat |  |  | Owner |
| SIM-010 | Closing shift | Kasir + Owner | Cash/payment/report cocok dan catatan ada |  |  | Owner |

## 5. Pass / Fail Criteria

PASS jika:

- [ ] Staff menyelesaikan skenario tanpa dibimbing penuh.
- [ ] Order tercatat di sistem atau catatan resmi.
- [ ] Payment tidak dilunaskan sebelum bukti valid.
- [ ] Kitchen hanya menerima order valid.
- [ ] Komplain dicatat dan dieskalasi.
- [ ] Promo tidak melanggar aturan margin.
- [ ] Closing menghasilkan laporan owner.

FAIL jika:

- [ ] Staff memakai akun orang lain.
- [ ] Payment ditandai paid tanpa bukti.
- [ ] Order WA/QR hilang.
- [ ] Kitchen memproses order rejected/pending.
- [ ] Promo dijanjikan tanpa approval.
- [ ] Komplain tidak dicatat.
- [ ] Closing tidak bisa menjelaskan selisih.

## 6. Staff Sign-Off

| Nama Staff | Role | Skenario Lulus | Trainer | Tanggal | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 7. Handover Setelah Training

- [ ] Semua blocker dicatat di `docs/PILOT-ISSUE-LOG.md`.
- [ ] Staff yang `Needs Retry` dijadwalkan latihan ulang.
- [ ] Owner menerima ringkasan pass/fail.
- [ ] Campaign publik hanya berjalan jika role kritis lulus: owner/manager, kasir, kitchen, marketing/WA.

## 8. Rujukan

- `docs/SOP-FINAL-OPERASIONAL-GARAGE.md`
- `docs/buku-pintar-panduan-sop-karyawan.md`
- `docs/garage-qr-cashier-sop.md`
- `docs/GARAGE-WHATSAPP-ORDER-SOP.md`
- `docs/GARAGE-PROMO-PROFIT-WORKSHEET.md`
- `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md`
