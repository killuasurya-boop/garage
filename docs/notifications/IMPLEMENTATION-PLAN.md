# Smart Notification Engine V2 — Rencana Implementasi

Branch: `feat/smart-notification-v2` (dari `origin/main` a1a9d77). Tidak ada merge/deploy tanpa OK Owner.
Temuan = `AUDIT.md` (F-xx). Skenario = daftar uji Fase 9 (1–15).

## Tahap 0 — P0 (PR ini) ✅

| # | Perubahan | Temuan | File | Uji |
|---|---|---|---|---|
| 0.1 | Audience `bar` / `dapur`; Minta Bahan "dikirim gudang" hanya ke divisi peminta | F-01 | `staff-notifications.ts`, `wms-material-request.ts` | unit `audiencesFor`; integrasi feed Bar/Dapur |
| 0.2 | "Siap · Panggil" / handover mengirim `ready_to_deliver` ke waiter (atau waiter yang dipilih); dine-in bermeja saja; body menyebut stasiun yang masih proses | F-03 | `garage-service.ts` (`notifyReadyToDeliver`) | integrasi order campuran (skenario 3, 8) |
| 0.3 | Suara Hub: area suara = stasiun perangkat; satu event per refresh per stasiun; "pesanan siap" hanya saat seluruh pesanan siap; voice order baru di stasiun; tombol Tes suara + indikator audio | F-02 (sisi stasiun), F-04, F-05, F-19 | `hub-sound-rules.ts`, `use-hub-sound.ts`, `production-hub-v4.tsx` | unit (skenario 1–4, 7) |
| 0.4 | `claimSound`: satu event = satu bunyi per perangkat (lintas tab, re-render, reconnect, refresh); dipakai voice, lonceng, ulangan urgent, Hub, waiter-view, badge Persetujuan, AI alert, stok menipis | F-06, F-10, F-12 | `sound-claim.ts`, `garage-voice.ts`, `staff-notification-center.tsx`, `waiter-view.tsx`, `garage-app.tsx`, `garage-ai-alerts-bell.tsx` | unit (skenario 5, 6) |
| 0.5 | Logout melepas langganan push perangkat | F-07 | `push-client.ts`, `garage-app.tsx`, `wms-shell.tsx` | manual (butuh browser + izin notifikasi) |
| 0.6 | Label pembayaran notifikasi: "menunggu verifikasi kasir" / "lunas (verifikasi manual kasir)" | F-08 | `payment-notice.ts`, `garage-service.ts` | unit + integrasi (skenario 9) |
| 0.7 | Resolve: kolom `resolved_at`/`resolved_reason` (migrasi aditif 0177); resolve saat order diterima/ditolak/lunas/void, take away diserahkan, panggilan selesai, tiket diantar/dibuka ulang/batal; lonceng: tab Perlu aksi / Dibaca / Selesai, item selesai tidak di-toast, tidak diulang, tidak membuka aksi | F-11 | `schema.ts`, `drizzle/0177_*`, `staff-notifications.ts`, `garage-service.ts`, `staff-notification-center.tsx` | integrasi (skenario 7, 15) |
| 0.8 | Selisih kas review/critical → notifikasi `management` (nominal hanya untuk manajemen) | F-09 | `garage-service.ts` (`closeCashSession`) | integrasi `garage-cash-session` (skenario 10, 11) |

Feature flag: tidak ditambah. Alasannya: semua perubahan aditif, suara Hub tetap di balik tombol "Suara ON" per perangkat, voice per skenario tetap bisa dimatikan per perangkat (Voice Settings).

### Rollback
1. Revert commit PR (kode).
2. Migrasi 0177 **tidak perlu** di-rollback: dua kolom nullable + satu index; kode lama tidak membacanya. Jika tetap ingin bersih: `DROP INDEX staff_notifications_order_idx; ALTER TABLE staff_notifications DROP COLUMN resolved_reason, DROP COLUMN resolved_at;` (hanya dengan OK Owner).
3. `localStorage["garage:sound-ledger:v1"]` di perangkat tidak berbahaya bila dibiarkan.

### Kriteria terima (Tahap 0)
- Lint 0 error, typecheck bersih, unit + integrasi lulus, full suite tanpa regresi (lihat laporan).
- Uji operasional di staging (butuh Owner/Manajer & perangkat): Bar/Dapur tablet, HP waiter, 2 tab di satu tablet, logout di tablet bersama.

## Tahap 1 — P1 ✅ (dikerjakan setelah merge main #160)

| # | Status | Catatan |
|---|---|---|
| 1.1 | ✅ | Pengumuman `all_ready` hanya oleh pemanggil yang membuat job cetak SELESAI (advisory lock per order yang sudah ada) → chat/push pelanggan sekali, termasuk reopen → READY lagi |
| 1.2 | ✅ sebagian dari #160 | Notifikasi pengajuan batal dibuat PR #160; V2 menambah resolve saat approval diputus (`decideApproval`, juga jalur PIN & bulk) |
| 1.3 | ✅ | `wms-notify.ts`: PO `pending_approval` (ajukan/revisi) & opname dikirim → management (urgent bila perlu Owner), selesai saat setuju/tolak/batal/hitung ulang. Drawer WMS: "+N lagi", Minta Bahan/PO/opname menunggu |
| 1.4 | ✅ | `cash_variance` selesai saat `APP-CASH-*` diputus |
| 1.5 | ✅ tidak perlu | Diverifikasi: cabang render saling eksklusif |
| 1.6 | ✅ | Lonceng mengikat ulang langganan push yang ada ke akun yang sedang login |
| 1.7 | ⏳ | Panel cek tutup shift terpadu — belum (perlu desain UI bersama Owner) |

### Rencana awal Tahap 1

| # | Pekerjaan | Temuan | Risiko / catatan |
|---|---|---|---|
| 1.1 | Lock per order di pengecekan "semua siap" (advisory lock seperti cetak SELESAI) + uji konkuren | F-14 [S] | Uji dulu; ubah `updateKitchenStatus` dengan hati-hati (regresi KDS) |
| 1.2 | Notifikasi pengajuan batal order/item (persetujuan Manajer) ke `management`, resolve saat diputus | Matrix §1 | — |
| 1.3 | WMS: "+N lagi", Minta Bahan pending, PO `pending_approval`, opname `submitted`/perlu Owner, bahan yang memblokir resep; collapse per item+lokasi+jenis (`dedup_key` = `wms:<jenis>:<lokasi>:<item>:<hari>`) | F-13 | Jangan spam: satu baris per kondisi, resolve saat kondisi hilang |
| 1.4 | Resolve `cash_variance` saat approval `APP-CASH-*` diputus | F-09 | — |
| 1.5 | Cek DOM: lonceng ter-mount ganda | F-15 [S] | Uji di 1366×900 & 390×844 |
| 1.6 | Status push "aktif" di lonceng memeriksa kepemilikan langganan (GET per endpoint) | F-07 | — |
| 1.7 | Panel cek tutup shift terpadu (per metode, expected vs counted, pending, koreksi, kesiapan) memakai `getShiftAccountability`; petty cash tidak pernah dihitung omzet | Fase 6 | Hanya tampilan; tidak mengubah ledger |

## Tahap 2 — P2

| # | Pekerjaan |
|---|---|
| 2.1 | Owner Notification Control Center: health (push gagal, langganan mati, SSE klien), routing log per event (`kind`, audience, jumlah penerima push), filter stasiun/status/prioritas |
| 2.2 | Speaker panggilan pickup khusus (perangkat "Pickup" yang ditandai; hanya dipicu staf; tanpa nama/HP pelanggan — nomor antrean saja) |
| 2.3 | Eskalasi berdasarkan durasi & prioritas (mis. `ready_to_deliver` > 5 mnt → management) |
| 2.4 | `/api/smart-notif/trigger`: hapus atau batasi (rate limit, Owner/Manajer, format `{ data }`) |
| 2.5 | `owner_announcement` diberi `dedupKey` |
| 2.6 | Ukur P95 realtime (timestamp `created_at` vs waktu render klien, dikirim ke log) |
| 2.7 | Keputusan Owner: menu digital "hanya lihat" (checkout pelanggan masih aktif di kode) |

## Dependensi
- Tahap 1.3 bergantung pada audience `bar`/`dapur` & resolve (Tahap 0).
- Tahap 2.1 bergantung pada log pengiriman push (perlu kolom/tabel aditif baru).
- Deploy: sesuai `docs/DEPLOY_MANUAL.md` — `release-check.sh` di main yang sudah di-merge, lalu `deploy-manual.sh --dry-run`, `--yes`. Migrasi 0177 ikut otomatis dan aditif.
