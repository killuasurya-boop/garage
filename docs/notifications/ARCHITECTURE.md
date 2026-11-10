# Smart Notification Engine V2 — Arsitektur

Tujuan: **satu event → penerima benar → perangkat benar → aksi benar**, tanpa infrastruktur baru.
Prinsip kompatibilitas: memperluas `staff_notifications` + `notifyStaff` yang sudah dipakai 11 sumber; migrasi hanya aditif; perilaku lama tetap jalan bila kolom/flag baru belum dipakai.

## 1. Komponen

```
 sumber domain (service layer, di dalam/ setelah tx)          klien (per perangkat)
 ─────────────────────────────────────────────────           ──────────────────────────────
 createCustomerOrder, createServiceRequest, closeCashSession,   StaffNotificationCenter (lonceng)
 handoverKitchenTicket, material request, sweeper, system...    ├─ GET /api/notifications (RBAC)
            │                                                   ├─ SSE /api/production/stream (tanda saja)
            ▼                                                   ├─ sound-claim (lintas tab + refresh)
   notifyStaff(input)  ── router: audience → penerima ──┐       └─ voice / ding / toast / visual
   resolveStaffNotifications({ dedupKeys | orderId })   │
            │                                           ├─► staff_notifications (persisten, dedup_key unik)
            ├─► publishProductionChange() (SSE)         │
            └─► pushToAudience() (web push, async) ◄────┘     Production Hub (use-hub-sound)
                                                              └─ hub-sound-rules (pure) + sound-claim
```

* **Router** = `audiencesFor(profile)` (siapa termasuk audience apa) + `audience` yang dipilih sumber. Tetap satu fungsi murni, diuji unit.
* **Penyimpanan** = `staff_notifications` (satu baris per event, bukan per penerima) + `staff_notification_reads` (ack per user).
* **Realtime** = SSE tanpa payload (klien re-fetch lewat API ber-RBAC) + polling cadangan 30 dtk. Tidak ada broker baru.
* **Push** = Web Push VAPID, async, gagal kirim tidak membatalkan transaksi.
* **Audio** = di klien. Server tidak pernah memutuskan "bunyi"; server hanya menentukan *siapa* menerima. Klien memutuskan *bunyi sekali* per perangkat.

## 2. Model data

### Sudah ada (dipakai)
| Field target | Kolom saat ini |
|---|---|
| event_id | `staff_notifications.id` |
| type | `kind` |
| target role/workstation | `audience` (+ `audiencesFor`) |
| target user | `user_id` (audience `user`) |
| priority | `severity` (info / warning / urgent) |
| deep_link | `url` |
| correlation_id | `order_id` (order) / `dedup_key` prefix |
| dedup_key | `dedup_key` (unique index) |
| created / ack | `created_at` / `staff_notification_reads.read_at` |

### Ditambahkan di PR ini (migrasi aditif `0183_notification_resolve_par_stock`)
| Kolom | Tipe | Makna |
|---|---|---|
| `resolved_at` | timestamptz null | Kejadian sudah tidak perlu aksi (order diterima, panggilan selesai, tiket diantar). Klien berhenti mengulang bunyi, kartu pindah ke "Selesai", tombol aksi disembunyikan. |
| `resolved_reason` | text null | Alasan singkat ("Order diterima", "Panggilan diselesaikan", …) |
| index `staff_notifications_order_idx` | (order_id) | Resolve per order cepat |

Tidak ada kolom yang dihapus/diubah. Baris lama = `resolved_at` null = perilaku lama.

### Audience (nilai teks, tanpa migrasi)
| Audience | Siapa | Catatan |
|---|---|---|
| `cashier` | `canHandleMoney` (Kasir tanpa stasiun, Owner, Manajer) | transaksi, pembayaran, pickup, chat |
| `waiter` | Waiter non-kurir | panggilan meja, siap antar |
| `courier` | Waiter workstation `kurir` | |
| `bar` **(baru)** | Kasir workstation `bar` / `helper_bar` / `all` / `helper_all` | hanya pekerjaan Bar |
| `dapur` **(baru)** | Kasir workstation `dapur` / `helper_dapur` / `all` / `helper_all` | hanya pekerjaan Dapur |
| `production` | semua stasiun (lama) | dipertahankan untuk pengumuman umum ke Bar+Dapur |
| `management` | Owner, Manajer | pengecualian, persetujuan, risiko |
| `user` | `user_id` tertentu | kurir ditugaskan, waiter dipilih, system alert Owner |
| `all` | semua | pengumuman |

Pemetaan produk → stasiun **sudah dapat dikonfigurasi**: kategori produk punya `station` (`bar`/`dapur`/`none`) dan produk bisa override (`productionStationFor`, `isDirectHandoverMenu`). V2 memakai pemetaan itu apa adanya — order campuran sudah dipecah per stasiun di server (`kitchen_tickets` per order × station).

## 3. Alur utama

### 3.1 Order campuran
```
POS / waiter order ──► kitchen_tickets: [Bar #T1] [Dapur #T2] (orderNo sama)
  Hub Bar  : lihat T1 baru → 1 tone + voice "order baru Bar" (perangkat Bar saja)
  Hub Dapur: lihat T2 baru → 1 tone + voice "order baru Dapur"
  T1 READY (Dapur belum) → kartu berubah; TIDAK ada voice "pesanan siap"
  Bar "Siap · Panggil" T1 → notifyStaff(ready_to_deliver, waiter, body "Dapur masih diproses")
  T2 READY → server all_ready (chat/push pelanggan, cetak SELESAI) ; Hub Dapur: 1 voice "pesanan siap"
  T1/T2 delivered → resolve ready_to_deliver:<ticket>
```
Antar parsial didukung per tiket (helper Bar & Dapur menyerahkan masing-masing), maka "siap antar" dikirim per tiket dengan keterangan stasiun lain yang belum siap.

### 3.2 Bunyi sekali per perangkat (`src/lib/sound-claim.ts`)
```
claimSound(key, ttl):
  navigator.locks.request("garage:sound-ledger", exclusive)   // atomik antar tab satu origin
     ledger = localStorage["garage:sound-ledger:v1"]           // { key: playedAt }
     if ledger[key] masih dalam TTL → false (tab lain / sebelum refresh sudah bunyi)
     ledger[key] = now; buang entri kedaluwarsa; simpan → true
  tanpa Web Locks → cek-lalu-tulis localStorage (best effort) ; tanpa storage → set in-memory
```
Dipakai oleh: `voice.announce` (bila ada `dedupKey`), ding lonceng, ulangan urgent, tone Hub, waiter-view. TTL default 30 menit → refresh/reconnect tidak mengulang bunyi (skenario 6).

### 3.3 Resolve
`resolveStaffNotifications({ dedupKeys?, orderId?, kinds? }, reason)` — `UPDATE … SET resolved_at = now() WHERE resolved_at IS NULL`, idempoten, lalu `publishProductionChange()`. Dipanggil setelah mutasi domain sukses (non-blocking):
* order diterima / ditolak / void → `qr_new`, `unpaid_expiring` order itu
* `all_ready` diserahkan (handed) → `takeaway_ready`
* service request diselesaikan → `service:<id>`
* tiket delivered → `ready_to_deliver:<ticket>:*`
* approval selisih kas diputus → `cash_variance:<session>` (rencana)

Klien: item resolved tidak di-toast, tidak diulang, ditandai "Selesai" dan tombol aksinya disembunyikan (skenario 15: notifikasi basi tidak bisa memicu aksi salah; aksi domain sendiri tetap divalidasi server).

### 3.4 Pembayaran
* Status pembayaran tetap dari `paymentStatusOf` (Pending/Lunas/Dibatalkan/Refund). V2 tidak mengubah uang, ledger, atau status.
* `paymentNoticeLabel(method, status)` (`src/lib/payment-notice.ts`, murni): non-tunai yang belum lunas → "QRIS · menunggu verifikasi kasir"; lunas non-tunai → "QRIS · lunas (verifikasi manual kasir)". Dipakai di body notifikasi.
* Tidak ada pemindahan uang antar akun untuk "menyeimbangkan"; koreksi tetap lewat alur yang ada (`correctPaymentMethod`, `revertOrderPayment`, approval, audit).

### 3.5 Keamanan
* RBAC di server: feed disaring `audiencesFor` + outlet + `user_id` (tidak berubah). Klien tidak bisa meminta audience lain.
* Logout melepas langganan push perangkat (`DELETE /api/push/subscribe` + `pushManager.unsubscribe()`), sehingga layar kunci perangkat bersama tidak menerima push user sebelumnya.
* Nominal selisih kas hanya di notifikasi audience `management`.
* Pickup/pelanggan: notifikasi staf tidak memuat nomor HP; nama pelanggan hanya ke kasir/kurir yang memang menangani.

## 4. Strategi kompatibilitas & flag
* Semua sumber lama tetap memanggil `notifyStaff` dengan bentuk input yang sama; field baru opsional.
* Audience `production` tetap valid.
* Klien lama (tab yang belum reload) mengabaikan field `resolvedAt` → perilaku lama.
* Perubahan suara Hub hanya aktif saat "Suara ON" di Hub (seperti sebelumnya). Voice POS → Bar/Dapur tetap ada dan bisa dimatikan per perangkat lewat Voice Settings (tidak dipaksa mati agar outlet yang hanya punya speaker kasir tidak kehilangan pengumuman).
* Rollback: revert PR; kolom `resolved_at`/`resolved_reason` boleh tetap ada (nullable, tidak dibaca kode lama).

## 5. Di luar cakupan (sengaja)
Broker/queue baru, transactional outbox (belum perlu: notifikasi dibuat setelah commit dan dedup_key membuat retry aman), integrasi WA/email, verifikasi QRIS otomatis (tidak ada provider).
