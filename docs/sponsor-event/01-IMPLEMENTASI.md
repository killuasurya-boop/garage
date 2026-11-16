# Sponsor Event

Owner, 16 Nov 2026. Modul Garage OS untuk mencatat sponsor event (mis. GIGS AKHIR TAHUN 2026). Platform GIGS sendiri
(`/event`, aplikasi terpisah di server) tidak diubah; modul ini adalah sumber kebenaran **uang** sponsor.

## Keputusan Owner

| Pertanyaan | Keputusan |
|---|---|
| Uang sponsor masuk ke mana | **Selalu Rekening Jago** |
| Di laporan keuangan | **Pendapatan lain**: menambah net profit, bukan omzet |
| Yang dicatat | Paket & nilai kesepakatan · kewajiban + bukti foto · sponsor barang · cicilan & pengingat |
| Akses | **Owner saja** (login langsung; Manajer, Kasir, Waiter, dan API key agent ditolak) |

## Alur

1. **Sponsor baru** di `/control/sponsors`: nama event, sponsor, paket, nilai uang yang disepakati, kontak WhatsApp. Nomor `SPN-YYMM-NNN`.
2. **Jadwal cicilan** (DP, termin, pelunasan). Total jadwal tidak boleh melebihi nilai kesepakatan; kurang = "belum dijadwalkan".
3. **Uang masuk**: dicatat setelah mutasi terlihat di Rekening Jago. Satu pembayaran = satu baris buku kas
   `external → bank_jago` (`sponsor_income`) dalam satu transaksi. Nomor referensi mutasi tidak boleh dobel; permintaan
   ganda (`idempotencyKey`) tidak menggandakan. Foto bukti disimpan non-publik (`storage/cash-receipts`).
   Uang yang masuk dialokasikan otomatis ke cicilan dengan jatuh tempo paling awal.
4. **Salah catat** → "Batalkan" dengan alasan: baris pembalik `bank_jago → external` (`sponsor_income_void`, `reverses_id`).
   Riwayat tidak dihapus atau diedit.
5. **Kewajiban** ke sponsor (logo di poster, disebut MC, booth…): tenggat, centang selesai, foto bukti. Yang sudah selesai
   tidak bisa dihapus.
6. **Sponsor barang**: barang, jumlah, perkiraan nilai. **Tidak** masuk buku kas atau laba rugi; hanya untuk "total dukungan".
7. **Status**: aktif → selesai, atau batal (wajib alasan). Uang yang sudah masuk tetap terhitung.

## Laba rugi

`loadDayRaws` membaca buku kas: `otherIncome` = Σ `sponsor_income` − Σ `sponsor_income_void` per `business_date`.
`netProfit = operatingProfit + otherIncome − nonOperating`; `netSales` tidak berubah; `cashIn` + kanal "Sponsor".
`ENGINE_VERSION` 6 (snapshot otomatis dihitung ulang; hari yang dikunci Daily Closing tidak berubah — layar memberi
peringatan bila uang dicatat untuk hari yang sudah dikunci). Baris "Pendapatan lain (sponsor event)" tampil di P&L
Keuangan, Closing, dan ekspor laporan bila nilainya ≠ 0.

## Pengingat (HP Owner)

Sweeper server tiap 15 menit (`sweepSponsorReminders`), dedup per Owner:
cicilan H-3, hari H, terlambat hari ke-1/3/7 lalu tiap 7 hari; kewajiban H-1 dan lewat tenggat (pola yang sama).
Hanya sponsor aktif. Bahasa netral.

## Berkas

- Migrasi `0194_event_sponsors`: `event_sponsors`, `event_sponsor_installments`, `event_sponsor_payments`,
  `event_sponsor_obligations`, `event_sponsor_inkind`.
- Aturan murni `src/lib/event-sponsor-rules.ts`; server `src/lib/event-sponsor-service.ts`; API `src/app/api/sponsors/**`;
  layar `src/components/ceo/sponsors/SponsorsPanel.tsx` (`/control/sponsors`, menu "Sponsor Event").
- Reset grand opening: sponsor/jadwal/kewajiban/barang = KEEP, pembayaran = CLEAR (berpasangan dengan buku kas).
- Staging: kontak sponsor disamarkan (`scripts/staging-anonymize.sql`).

## Uji

- `event-sponsor-rules.test.ts` (11): alokasi cicilan, status, batas jadwal, pengingat 1/3/7, bahasa netral, nomor WA.
- `event-sponsor.integration.test.ts` (11): akses Owner/Manajer/agent, baris buku kas, idempoten, referensi dobel,
  pembalik, laba rugi (net profit naik, omzet tetap), tanggal hari ini pagi hari, pengingat sekali per kunci.
- Browser 1366×900 & 390×844: buat sponsor → jadwal → uang masuk + foto bukti → referensi dobel ditolak → kewajiban →
  barang; Kasir ditolak (API 403, halaman dialihkan); P&L menampilkan "Pendapatan lain (sponsor event)".

## Rollback

Revert PR. Tabel baru tidak dibaca kode lama. Baris buku kas `sponsor_income*` yang sudah ada tetap sah (immutable) dan
tetap memengaruhi saldo Rekening Jago; tanpa modul ini laba rugi tidak lagi menghitungnya sebagai pendapatan lain.
