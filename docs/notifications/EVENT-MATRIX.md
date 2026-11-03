# Event Matrix — Smart Notification Engine V2

Kolom "Sekarang" = perilaku di `origin/main` a1a9d77 (lihat `AUDIT.md`). Kolom "V2" = target routing.
Kode modul: POS, PRD (produksi), WTR (waiter), QR (menu digital), PKP (pickup), SHF (shift/kas), WMS, PUR (pengadaan), FIN, OWN, SYS.
Kolom ✅ = sudah diterapkan di branch `feat/smart-notification-v2`.

## 1. Order & produksi

| Event (kind) | Pemicu & asal data | Sekarang: penerima / perangkat / kanal | V2: penerima / perangkat | Prioritas | Resolve | Risiko dobel / bocor | Aksi (deep link) | ✅ |
|---|---|---|---|---|---|---|---|---|
| `qr_new` order menu digital | `createCustomerOrder` `garage-service.ts:9999` | cashier (Kasir tanpa stasiun + Owner/Manajer), feed + push + ding/voice (dibisukan bila POS terbuka) | Sama. Body pembayaran: "QRIS · menunggu verifikasi kasir" | high (take away/delivery) / normal | order diterima / ditolak / void | Push ke semua HP Owner/Manajer — sesuai | `/os?module=pos&qr=1` | ✅ body, ✅ resolve |
| Order POS baru (voice Bar/Dapur) | `pos-view.tsx:3788-3801` setelah `POST /api/orders` | Speaker KASIR, 2 voice untuk order campuran | Perangkat stasiun yang punya tiket itu (Hub, area = stasiun perangkat); kasir tetap bisa dimatikan per perangkat (Voice Settings) | normal | — | Dobel bila kasir & stasiun sama-sama ON (beda perangkat, sengaja) | — | ✅ Hub |
| Tiket baru masuk stasiun | Board diff `use-hub-sound.ts` | Tone di semua perangkat Hub yang area-nya cocok (termasuk "Semua") | Hanya perangkat stasiun tsb; satu tone per batch refresh (bukan per item) | normal | tiket mulai | Antartab → klaim lintas tab | — | ✅ |
| Tiket lewat SLA | `lateIds` Hub | Tone "late" area tampilan | Hanya stasiun perangkat; satu tone per refresh; berhenti saat tiket tidak aktif | high | tiket ready/batal | — | — | ✅ |
| Satu stasiun READY (order campuran) | `updateKitchenStatus` ready | Voice "pesanan siap" di Hub per tiket | Tidak ada voice "pesanan siap"; hanya kartu berubah | — | — | Dulu dobel | — | ✅ |
| Seluruh order READY (`all_ready`) | `garage-service.ts:12918-12935` | Chat+push pelanggan; `takeaway_ready` → cashier; Hub voice per tiket | Server: sama. Hub: SATU voice "pesanan siap" di perangkat stasiun yang menyelesaikan tiket terakhir | high | diserahkan / diambil | [S] race F-14 | Kasir: `/os?module=pos` | ✅ klien |
| Siap antar / Panggil waiter (`ready_to_deliver`) | `handoverKitchenTicketImpl` (ready_call / handover) | **Tidak ada** (toast "Waiter dipanggil." saja) | Waiter (atau waiter yang dipilih → audience `user`), dine-in bermeja saja; body menyebut stasiun lain yang masih proses (antar parsial didukung per tiket) | high | tiket delivered | Panggil ulang = event baru (dedup per `handover_at`) | `/os?module=waiter` | ✅ |
| Pengingat READY belum diambil | `use-hub-sound.ts:137-149` (3–5 mnt) | Voice di area tampilan | Perangkat stasiun saja; berhenti saat tiket bukan READY | normal | delivered | — | — | ✅ |
| `takeaway_ready` pickup | `announceOrderProgress` all_ready | cashier feed + push + voice | Sama; resolve saat diserahkan. Speaker pickup khusus = NOT IMPLEMENTED (lihat rencana Fase 3) | high | handed | — | `/os?module=pos` | ✅ resolve |
| Order dibatalkan / item batal (persetujuan) | `/api/production/cancel-requests` → approval | management urgent (PR #160) | Sama + selesai saat approval diputus | high | approval diputus | — | `/os?module=approvals` | ✅ |
| Tiket dibatalkan | `getProductionBoard.cancelled` | Kartu "Dibatalkan" di Hub | Sama + resolve notifikasi order terkait | normal | — | — | — | ✅ resolve |

## 2. Waiter & meja

| Event | Pemicu | Sekarang | V2 | Prioritas | Resolve | Risiko | Aksi | ✅ |
|---|---|---|---|---|---|---|---|---|
| `service_call/bill/water/move/other` | `createServiceRequest` `:7869` | waiter feed + push + ding + voice **dan** waiter-view tone+getar → dobel | Satu bunyi per perangkat (klaim `service:<id>` dipakai bersama) | high (bill = normal) | request diselesaikan | Dulu dobel | `/os?module=waiter` | ✅ |
| Meja dipindah / dibersihkan | `moveTable`, clean | Refresh SSE (tanpa notifikasi) | Sama (state, bukan notifikasi) | — | — | — | — | — |

## 3. Kasir, pembayaran, shift

| Event | Pemicu | Sekarang | V2 | Prioritas | Resolve | Risiko | Aksi | ✅ |
|---|---|---|---|---|---|---|---|---|
| `unpaid_expiring` | sweeper `garage-courier.ts:620` | cashier | Sama | normal | order dibayar/ditolak | — | `/os?module=pos&qr=1` | ✅ resolve |
| `auto_rejected` | sweeper `:641` | cashier | Sama | normal | info | — | idem | — |
| `chat` | `:8104` | cashier, bucket 2 mnt | Sama | normal | dibalas (rencana) | — | `/os?module=pos&chat=1` | — |
| `delivery_arrived` | `:8470` | cashier | Sama | info | — | — | `/os?module=courier` | — |
| `courier_assigned` | `garage-courier.ts:283` | user kurir | Sama | high | delivered | Alamat pelanggan hanya ke kurir yang ditugaskan | `/os?module=courier` | — |
| Selisih kas review/critical (`cash_variance`) | `closeCashSession` `:19343` | Approval saja; voice di perangkat kasir | + notifikasi **management** (Owner/Manajer outlet), tanpa ke kasir/stasiun; selesai saat `APP-CASH-*` diputus | high / critical | approval diputus | Nominal hanya ke management | `/os?module=approvals` | ✅ |
| Selisih minor (≤ Rp10.000) | idem | tidak dieskalasi | Tetap tidak dieskalasi (aturan kas) | — | — | — | — | — |
| QRIS pending vs lunas | `paymentStatusOf` | Status benar; label notifikasi ambigu | Label eksplisit "menunggu verifikasi kasir"; QRIS di POS = "verifikasi manual kasir" | — | — | — | — | ✅ (notifikasi) |
| Transaksi pending sebelum tutup shift | `pos-close-shift-form.tsx` | Banner meja aktif + QR pending | Panel cek terpadu (belum lunas, kas keluar/masuk menunggu, koreksi, non-tunai); tanpa kas tunai untuk Kasir | — | — | — | — | ✅ |

## 4. WMS, pengadaan

| Event | Pemicu | Sekarang | V2 | Prioritas | Resolve | ✅ |
|---|---|---|---|---|---|---|
| Minta Bahan dibuat | `wms-material-request.ts:149` | management | Sama | normal/urgent | dikirim | — |
| Bahan dikirim gudang | `:279` | **production (Bar + Dapur)** | Hanya divisi peminta (`bar` / `dapur`) | normal | diterima | ✅ |
| Kekurangan → perlu beli | `:288` | management | Sama | normal | PO dibuat | — |
| Stok menipis (voice) | `garage-app.tsx:645` | Voice per SKU di setiap perangkat ber-inventori | Satu voice per batch ("N bahan menipis"), klaim lintas tab | normal | stok pulih | ✅ |
| Low/out stock, cold chain, receiving draft | `getWmsNotifications` | Drawer WMS (pull, dipotong 5) | Habis dulu, "+N lagi", + Minta Bahan / PO / opname menunggu (satu baris per jenis) | normal | kondisi hilang | ✅ |
| PO menunggu approval (`po_approval`) | `submitPurchaseOrder` / `revisePurchaseOrder` | NOT IMPLEMENTED | management, satu per pengajuan/revisi | normal | setuju / tolak / batal | ✅ |
| Opname menunggu review (`opname_review`) | `submitWmsOpname` | NOT IMPLEMENTED | management; urgent "perlu OWNER" bila ada baris kelas owner | high | disetujui / ditolak / hitung ulang | ✅ |

## 5. Owner & sistem

| Event | Pemicu | Sekarang | V2 | ✅ |
|---|---|---|---|---|
| `system_alert` | `/api/jobs/system-alert` | Owner per user, 1×/jam/cek | Sama | — |
| `staff_access_request` | `staff-access.ts:141` | management (`outletId` null) | Sama | — |
| `approval_pending` voice | poll badge | Setiap tab berbunyi | Klaim lintas tab | ✅ |
| `ai_alert_high` | AI bell | Per tab | Klaim lintas tab (lewat `voice.announce` dedupKey) | ✅ |
| `owner_announcement` | AI tool | tanpa dedup | Rencana P2: dedupKey dari isi + menit | — |

## 6. Modul tanpa notifikasi (NOT IMPLEMENTED)

Event & Undangan Digital · CRM/member/loyalty (sebagai notifikasi staf) · Konten/iklan · Speaker panggilan pickup khusus · Notifikasi PO/opname.
Tidak dibuat di PR ini — dicatat sebagai rencana (`IMPLEMENTATION-PLAN.md`).
