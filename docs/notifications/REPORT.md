# Smart Notification Engine V2 — Laporan Akhir (Tahap 0 / P0)

Tanggal: 3 Nov 2026 · Branch `feat/smart-notification-v2` dari `origin/main` a1a9d77 · **Belum di-merge, belum di-deploy.**

## 1. Masalah & akar penyebab

| Masalah | Akar penyebab |
|---|---|
| Kiriman bahan Bar muncul di Dapur (dan sebaliknya) | Satu audience `production` untuk semua stasiun |
| "Waiter dipanggil." padahal waiter tidak menerima apa pun | Handover hanya update `handover_at`; tidak ada `notifyStaff`; waiter-view tidak memuat tiket siap |
| "Pesanan siap" diumumkan sebelum pesanan lengkap, dan dua kali | Suara Hub per tiket stasiun, bukan per pesanan |
| Tablet Bar berbunyi untuk Dapur saat tampilan "Semua" | Filter suara memakai area tampilan |
| Bunyi dobel di 2 tab / layar waiter | Dedup suara in-memory per tab; lonceng + waiter-view bereaksi pada event yang sama |
| Push akun lama tetap muncul di tablet bersama | Logout tidak melepas langganan push |
| "· QRIS" di notifikasi order bisa terbaca lunas | Body notifikasi memakai nama metode tanpa status |
| Notifikasi basi tetap "perlu aksi" dan terus diulang | Tidak ada status selesai (`resolved`) |
| Manajer tidak diberi tahu selisih kas besar | Hanya approval + suara di perangkat kasir |

## 2. File yang diubah

Baru: `src/lib/sound-claim.ts`, `src/lib/hub-sound-rules.ts`, `src/lib/payment-notice.ts`, `drizzle/0177_staff_notification_resolve.sql` (+ snapshot), `src/lib/smart-notification-v2.test.ts`, `src/lib/smart-notification-v2.integration.test.ts`, `docs/notifications/*`.

Diubah: `src/lib/staff-notifications.ts`, `src/lib/garage-service.ts`, `src/lib/wms-material-request.ts`, `src/lib/garage-voice.ts`, `src/lib/push-client.ts`, `src/db/schema.ts`, `src/components/garage/staff-notification-center.tsx`, `src/components/garage/production-hub/use-hub-sound.ts`, `src/components/garage/production-hub/production-hub-v4.tsx`, `src/components/garage/waiter-view.tsx`, `src/components/garage/garage-app.tsx`, `src/components/garage/garage-ai-alerts-bell.tsx`, `src/components/wms/wms-shell.tsx`, `src/lib/garage-cash-session.integration.test.ts`, `CLAUDE.md`.

Tidak disentuh: harga POS, data keuangan historis, ledger kas, status pembayaran, aturan cetak SELESAI/auto print, alur pembuatan order.

## 3. Hasil verifikasi (output nyata, 3 Nov 2026)

| Cek | Hasil |
|---|---|
| `npx tsc --noEmit` | bersih (0 error) |
| `npx eslint` (file yang diubah) | 0 error, 5 warning lama (`window.location.assign`) |
| Unit + integrasi baru (`smart-notification-v2*.test.ts`) | 21/21 lulus |
| `garage-notifications` + `garage-cash-session` integrasi | lulus (termasuk asersi baru `cash_variance`) |
| Full suite `npx vitest run` | **250 file, 1.656 tes lulus** (747 dtk) |
| `npm run build` | lulus |
| Uji browser (layar ber-login) | **Tidak dilakukan** — butuh login staf oleh Owner; lihat §5 |
| E2E Playwright | Tidak dijalankan di sesi ini (akan jalan di `release-check.sh`) |

### Skenario Fase 9

| # | Skenario | Bukti |
|---|---|---|
| 1, 2 | Order Bar-only / Dapur-only hanya bunyi di stasiunnya | unit `hubSoundEvents` + `soundAreaFor` |
| 3 | Order campuran terpecah benar | unit (event per stasiun) + integrasi (2 tiket, siap antar per stasiun) |
| 4 | 5 order bersamaan: tidak hilang, tidak dobel | unit (1 event berisi 5 tiket, kunci stabil) |
| 5 | Multi-tab tanpa bunyi dobel | unit `claimInLedger` (logika); Web Locks antartab perlu uji browser |
| 6 | Refresh/reconnect tanpa alarm ulang | unit (TTL ledger) + muat pertama tanpa bunyi |
| 7 | Order selesai menghentikan pengingat | integrasi (resolve panggilan & siap antar) + unit (tiket hilang) |
| 8 | Waiter dapat "siap antar" tepat waktu | integrasi (Bar Siap·Panggil → waiter; take away tidak) |
| 9 | QRIS pending tidak tampil lunas | unit + integrasi body `qr_new` |
| 10, 13 | Selisih kas / data terlarang hanya untuk yang berhak | integrasi feed per peran |
| 11 | Tutup shift menampilkan pengecualian | integrasi `cash_variance` ke manajemen; panel tutup shift lama tetap |
| 12 | Min-stock ke WMS tanpa spam | voice dikelompokkan per gelombang; notifikasi WMS persisten = Tahap 1.3 |
| 14 | Speaker mati → fallback visual | lonceng/toast/kartu tetap tampil; Hub menampilkan status "ketuk layar / tidak didukung" + Tes suara (uji browser belum) |
| 15 | Notifikasi basi tidak memicu aksi salah | integrasi resolve + klik item selesai tidak membuka aksi |

Target "P95 realtime ≤ 5 dtk": **belum diukur** (butuh instrumentasi produksi, Tahap 2.6).

## 4. Isu terbuka
- [S] Race "semua siap" saat dua stasiun READY bersamaan (Tahap 1.1).
- [S] Lonceng mungkin ter-mount ganda di beberapa layout (Tahap 1.5).
- WMS/PO/opname belum punya notifikasi persisten; Owner control center; speaker pickup.
- Menu digital masih bisa checkout pelanggan — butuh keputusan Owner (tidak diubah).
- Voice "order baru → Bar/Dapur" di perangkat kasir tetap default ON (outlet dengan satu speaker); matikan per perangkat lewat Pengaturan suara bila stasiun sudah bersuara sendiri.

## 5. Risiko deploy & langkah berikut
- Migrasi 0177 aditif (2 kolom nullable + 1 index) — aman, tanpa backfill.
- Perilaku baru yang terasa di lantai: waiter kini menerima "siap antar" (urgent, ding + voice); tablet Bar/Dapur dengan Suara ON kini mengucapkan "order baru" untuk stasiunnya.
- Sebelum merge: uji di staging dengan perangkat nyata — tablet Bar & Dapur, HP waiter, 2 tab di satu tablet, logout di tablet bersama, mode senyap/speaker mati.
- Deploy hanya dengan OK Owner: `release-check.sh` di main yang sudah di-merge → `deploy-manual.sh --dry-run` → `--yes`.

---

## Tahap 1 (P1) — tambahan di PR yang sama

Branch sudah di-merge dengan `origin/main` (PR #160, tanpa konflik). PR #160 sudah membuat notifikasi pengajuan batal Bar/Dapur → V2 tidak menduplikasi, hanya menambah resolve.

| Perubahan | File |
|---|---|
| `all_ready` diumumkan sekali per order (gate pada job cetak SELESAI yang ber-advisory-lock) — temuan F-14 dikoreksi: event tidak bisa hilang, tapi bisa dobel | `garage-service.ts` |
| Keputusan approval menyelesaikan `cancel-request:*` dan `cash_variance:*` (board, PIN, bulk) | `garage-service.ts` (`decideApproval`) |
| PO menunggu persetujuan & opname dikirim → management, selesai saat diputus | `wms-notify.ts` (baru), `wms-procurement.ts`, `wms-purchase.ts`, `wms-service.ts` |
| Drawer WMS: habis dulu, "+N lagi", Minta Bahan/PO/opname menunggu | `wms-service.ts` (`getWmsNotifications`) |
| Lonceng mengikat ulang langganan push perangkat ke akun yang sedang login | `staff-notification-center.tsx` |
| F-15 (lonceng dobel) diverifikasi tidak terjadi | — |

Belum: panel cek tutup shift terpadu (1.7), seluruh Tahap 2.

Hasil uji Tahap 1 (3 Nov 2026, setelah merge main #160):
- `tsc --noEmit` bersih; eslint file diubah 0 error.
- Full suite `vitest run`: 242/250 file lulus (1.628 tes) di bawah beban CPU dari sesi lain; 8 file gagal hanya karena `beforeAll` timeout 60 dtk (setup DB PGlite, tanpa asersi gagal).
- 8 file itu dijalankan ulang serial (`--maxWorkers=1`): **8/8 lulus (33 tes)**. Total **250/250 file, 1.661 tes lulus**.
- `npm run build` belum diulang sejak Tahap 1 (perubahan Tahap 1 hanya server lib + satu komponen; typecheck bersih).
