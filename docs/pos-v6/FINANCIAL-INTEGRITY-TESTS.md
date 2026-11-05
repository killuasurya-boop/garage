# Financial Integrity Tests

| # | Invarian | Tes |
|---|---|---|
| 1 | Harga × qty, subtotal, service, pajak, pembulatan bulat & ≥ 0; selisih pembulatan ≤ ½ langkah | `src/lib/pos-financial-invariants.property.test.ts` (fast-check, 2.000 run) |
| 2 | Kembalian = diterima − total ≥ 0; laci menerima tepat total | idem |
| 3 | Tunai kurang / kosong ditolak | idem + `tender-guard.test.ts`, `tender-guard.integration.test.ts` |
| 4 | QRIS/Transfer/E-Wallet tidak masuk laci | idem (property) + E2E #3 |
| 5 | Split: jumlah = total; tunai split ≤ total; tidak seimbang ditolak | property |
| 6 | Referensi ganda ditolak (dalam order & antar order, aman bersamaan) | property + `payment-reference-guard` (advisory lock) |
| 7 | Diskon manual/voucher ≤ dasar/batas | property + server `createOrder` |
| 8 | Refund + total baru = total lama, tidak negatif | property (`computeRefundSplit`) |
| 9 | Transaksi tidak terduplikasi (retry, respons hilang, ganti metode) | `idempotency-client.test.ts` + kunci unik DB |
| 10 | Modal awal, petty cash, setoran bukan omzet | `cash-ledger.integration.test.ts`, `shift-close-deposit.integration.test.ts`, `closing-audit-probe.integration.test.ts` |
| 11 | Koreksi metode/void punya audit trail | `garage-payment-correction.integration.test.ts`, `garage-approvals-void-refund.integration.test.ts` |
| 12 | Laporan shift sesuai ledger | `shift-accountability-report.integration.test.ts`, `cash-ledger-report.test.ts` |
| 13 | Blind count & double count | E2E #3, `garage-cash-session-shifts.integration.test.ts` |
| 14 | Tombol final tidak pernah "Terima" bila uang kosong/kurang; non-tunai selalu menyebut metode | property (`finalPayLabel`) |
| 15 | Uang diterima tidak terisi otomatis | `e2e/pos-guardian.spec.ts` |
