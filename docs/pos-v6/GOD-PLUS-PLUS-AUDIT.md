# GOD++ Audit Total POS — Garage OS POS V6

Tanggal: 5 Nov 2026 · Branch `ccr-29608758-dtli1n` (PR #175, draft, belum di-merge/deploy).
Lingkungan uji: PGlite lokal terisolasi (migrasi + seed baru), tanpa DB produksi, tanpa pembayaran nyata.

## Metode
Kode ditelusuri dari layar → API route → `garage-service.ts`/lib → skema. Temuan dianggap **terkonfirmasi** hanya bila
dibuktikan dengan membaca alur kode lengkap + reproduksi/tes. Dugaan tanpa bukti dicatat sebagai "diverifikasi aman" atau risiko.

## Matriks temuan

| ID | Prioritas | Modul / file | Temuan | Dampak kasir | Solusi | Bukti tes | Status |
|---|---|---|---|---|---|---|---|
| F-01 | **P1** | Pembayaran · `pos-view.tsx` `resetPaymentDialog`, `selectPaymentMethod` | "Uang diterima" diisi otomatis = total **saat dialog dibuka** dan tidak ikut berubah saat voucher/diskon. Reproduksi: total 50.000 → buka Bayar → pasang voucher 10.000 → layar "Terima Rp 50.000 · kembali Rp 10.000" padahal pelanggan belum menyerahkan uang. | Kembalian palsu → uang laci kurang; tunai dianggap diterima sebelum dikonfirmasi | Tidak ada isi otomatis; kasir mengetik nominal atau tekan **Uang Pas** (total terbaru); kartu "Isi uang yang diterima…" | `e2e/pos-guardian.spec.ts`; `pos-financial-invariants.property.test.ts` (label) | ✅ Diperbaiki |
| F-02 | P2 | Pembayaran · tombol final | Label generik "Konfirmasi Bayar" untuk QRIS/Transfer/E-Wallet dan tunai kosong — tidak menyebut metode & nominal yang dicatat | Salah metode (QRIS vs Tunai) tidak terlihat sebelum final | `finalPayLabel` (`src/lib/pos-final-pay-label.ts`): "Isi uang diterima", "Uang kurang Rp…", "Terima Rp… · kembali Rp…", "QRIS berhasil · Rp…", "Transfer diterima · Rp…" | property test: tunai kosong/kurang tidak pernah "Terima"; non-tunai selalu menyebut metodenya | ✅ Diperbaiki |
| F-03 | **P1** | Anti-dobel · `idempotency-client.ts`, `submitOrder`, `submitOpenBill`, Penjualan Langsung | Respons hilang (WiFi/timeout/5xx) padahal order tersimpan, lalu kasir **mengubah isi** (ganti Tunai→QRIS / ketik ulang nominal) → kunci baru → server membuat **order kedua** | Transaksi ganda, omzet & laci salah | Gagal **tidak pasti** → kunci lama dipakai lagi walau metode/nominal berubah (server mengembalikan order tersimpan, atau membuat sekali). Gagal pasti (400 validasi) → kunci baru. Item berubah (pesanan lain) → kunci baru. Pesan khusus "status belum pasti" | `src/lib/idempotency-client.test.ts` (7 tes) | ✅ Diperbaiki |
| F-04 | P2 | Offline · `pos-offline-queue/sync/status`, `pos-offline-banner.tsx` | Modul antrean offline POS **tidak pernah dipasang** di layar kasir: tidak ada indikator koneksi. (Tidak ada risiko transaksi lokal dianggap tersimpan — mode offline memang tidak aktif.) | Kasir baru tahu offline saat bayar gagal | Indikator koneksi di topbar (internet + `/api/health` tiap 30 dtk) + panel QC. Mode jual offline **tidak** diaktifkan (butuh keputusan Owner) | uji visual QC; E2E guardian cek "Server terhubung" | ⚠️ Sebagian (indikator ✅, mode offline = pilihan Owner) |
| F-05 | P2 | Printer · `print-client.ts` | Tidak ada status printer untuk kasir; kegagalan cetak hanya terlihat di panel struk saat itu | Struk/chit gagal tanpa jejak | `print-health.ts`: hasil cetak terakhir (struk, chit, slip) dicatat oleh `deliverPrintContent`, tampil di QC Kasir. Cetak gagal tidak menyentuh pembayaran | `print-health.test.ts` | ✅ Diperbaiki |
| F-06 | P3 (keputusan Owner) | Bayar 1 tap "⚡ Uang pas" | Menyelesaikan take away dengan uang diterima = total tanpa input | Bila pelanggan bayar kurang, kasir tetap mencatat lunas | Dipertahankan atas keputusan Owner 5 Nov 2026; total selalu dihitung saat ditekan (tidak basi) | — | ℹ️ Diterima Owner |

## Diverifikasi aman (bukan bug)

| Area | Bukti |
|---|---|
| Total & diskon dihitung server | `createOrder` menghitung ulang diskon manual (`computeManualDiscountAmount`, batas %, approval), voucher, poin; angka layar tidak dipercaya |
| Tunai kurang ditolak server | `planTender` (`tender-guard.ts`) dipakai server; `tender-guard.integration.test.ts` + property test |
| QRIS/non-tunai tidak masuk laci | `planTender` → `cashPortion = 0`; property test 2.000 kombinasi; E2E #3 (laci = modal + tunai saja) |
| Referensi pembayaran ganda | `assertPaymentReferencesUnused` + `pg_advisory_xact_lock` per referensi (aman dua kasir bersamaan) |
| Idempotensi tahan restart server | kunci disimpan unik di `orders.client_request_key`; jendela memori 15 menit |
| Double-click | tombol final `disabled` saat `paymentPending` + kunci sama |
| Cetak gagal ≠ pembayaran batal | `PaymentCompletePanel`: status cetak terpisah + cetak ulang; chit `printChitIfEnabled` dalam try/catch |
| Blind count | Kasir tidak melihat kas seharusnya (`redactOpenShiftSummary`); hitungan #2 kosong (E2E #3); topbar & QC tidak menampilkan nominal laci |
| Petty cash terpisah dari laci | buku kas tunggal (`cash_ledger_entries`, akun `petty` ≠ `drawer`), `cash-ledger.integration.test.ts`, `cashier-accountability.integration.test.ts`, `closing-audit-probe` |
| Setoran bukan penjualan | `close_deposit` drawer → deposit_transit (`shift-close-deposit.integration.test.ts`) |
| Routing Bar/Dapur & serah langsung | `garage-production-rules.test.ts`, `garage-kitchen.integration.test.ts` |
| Hak akses route | `api-route-auth.test.ts` (setiap route ber-guard) |
| Self-order pelanggan | Mode `digitalMenuMode` tidak diubah; tidak ada yang diaktifkan |

## Tidak diuji di sini (keterbatasan)
- Printer fisik (kertas habis, Bluetooth putus) — butuh perangkat outlet.
- Load test k6 / jam sibuk multi-kasir — tidak dijalankan (larangan uji ke VPS produksi); disarankan di staging.
- MSW & axe-core tidak ditambahkan (kegagalan API diuji lewat logika murni + E2E; aksesibilitas diuji manual).
