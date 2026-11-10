# Smart Partner Hub — Laporan Implementasi (B0–B6)

Status: **siap diuji di staging**. Belum di-merge ke `main`, karena merge ke `main` sama dengan deploy produksi.

## Keputusan yang dipakai (ACC GATE 0, 10 Nov 2026)
Semua rekomendasi default di `00-GATE0-AUDIT-PLAN.md` §9:
- DEC-03: kewajiban timbul sejak **Siap Antar**.
- DEC-05: promo Garage ditanggung Garage.
- DEC-06: kewajiban dicatat sebagai expense "HPP Mitra" saat settlement disetujui.
- DEC-08: Manajer mencatat transfer, Owner memverifikasi.
- DEC-13: produk HABIS ditolak server di POS.
- DEC-14: pelanggan tidak bisa checkout produk mitra.
- DEC-15: sesi login mitra terpisah dari staf.
- DEC-16: setoran = HPP (bukan rumus 60% dari papan desain).
- DEC-17: tanpa blur berat.

## Peta file
| Lapisan | File |
|---|---|
| Setelan | `garage-app-settings-types.ts`, `garage-settings-schema.ts` (kategori "Partner Hub"), `api/settings` |
| Migrasi | `drizzle/0188_partner_hub.sql` (12 tabel + 2 kolom, trigger append-only), rollback `docs/partner-hub/0188-down.sql` |
| Aturan murni | `src/lib/partner-hub-rules.ts` (+ `.test.ts`) |
| Order | `src/lib/partner-hub-orders.ts`, hook di `createOrderOnce`, `createCustomerOrder`, accept order, refund, `getMenuData` |
| Server | `src/lib/partner-hub-service.ts`, `partner-auth.ts`, `partner-hub-route.ts` |
| PDF | `src/lib/partner-report-pdf.ts` (A4 landscape, logo resmi, header berulang, DRAFT/FINAL) |
| API | `api/partners/*` (Owner/Manajer), `api/pos/partner-*`, `api/finance/partner-*`, `api/partner/*` (Portal Mitra) |
| UI | `/partner` (Portal Mitra mobile), `/partners` (staf: Pesanan, Ambil dari Mitra, Keuangan, Kelola), menu POS |
| Produksi | `garage-production.ts`: tiket ber-`partner_id` tidak tampil di Bar/Dapur |

## Matriks UAT

Kolom **Bukti otomatis** merujuk ke tes PGlite/vitest; staging = UAT manual oleh Owner.

| UAT | Bukti otomatis | Catatan |
|---|---|---|
| 01 Mitra belum disetujui | `partner-hub.integration` "tidak bisa diaktifkan" | Login ditolak bila mitra belum aktif (`authenticatePartner`) |
| 02 Rokok/cookies | Jalur Quick Retail tidak diubah; produk regular tanpa link → bukan mitra | Uji manual di staging |
| 03/04 Habis | "server menolak … Habis / Tutup / hub mati" | Menu digital & POS tampil HABIS (`getMenuData`) |
| 05 Offline | Status layanan tidak terverifikasi → ditolak (`partnerOrderBlockReason`) | Uji jaringan di staging |
| 06 Order campuran | "satu invoice, tiket Bar + tiket Mitra" | |
| 07 Waiter pesan | Jalur accept/open-bill membuat tiket Mitra (hook) | Uji manual |
| 08 Retry | UNIQUE `order_item_id` + `onConflictDoNothing` | |
| 09 Terima→proses→siap | "mitra terima → proses → siap" | |
| 10 Klaim ganda | Klaim waiter yang ada (`claimKitchenTicket`, guard `claimedBy`) | Uji 2 perangkat di staging |
| 11 Antar parsial | Tiket per mitra; antar per tiket | |
| 12 Pindah meja | `moveTable` memindah semua tiket order (termasuk Mitra) | Uji manual |
| 13 Tolak/batal | "order dibatalkan sebelum mitra memproses" | |
| 14 Harga berubah | "snapshot transaksi lama tetap" | |
| 15 Belum bayar tapi siap | Status bayar terpisah (`paymentLabel`) | |
| 16 Diskon/refund | Refund → `partner_adjustments`; diskon Garage tidak mengubah HPP | |
| 17 Closing outstanding | Settlement terpisah dari tutup shift | |
| 18 Parsial | "payout parsial lalu lunas" | |
| 19 Referensi ganda | "sudah pernah dicatat" | |
| 20 Mitra lihat mitra lain | 404 tiket, settlement, PDF | |
| 21 PDF 100+ baris | Header berulang (`newPage`); total = Σ baris dicek sebelum render | Uji 1.000 baris di staging |
| 22 DRAFT vs FINAL | "PDF settlement: FINAL berlogo, versi tetap" | |
| 23 Logo hilang | `PartnerReportLogoMissingError` (FINAL ditolak) | |
| 24 Gangguan partner | Hub mati → produk Garage tetap jual (tes) | |
| 25 WA gagal | Notifikasi in-app sumber utama; tautan wa.me hanya tambahan | |
| 26 Last order | `partner-hub-rules.test` "last order per hari WIB" | |

## Belum termasuk (P1/P2)
- Klaim grup per meja dan rute/trip pengantaran.
- Alarm SLA otomatis berbasis job. SLA sudah ditampilkan di layar.
- Template WhatsApp API.
- Pengajuan harga dari mitra.
- Penyesuaian manual via UI. API `POST /api/finance/partner-adjustments` sudah ada.
