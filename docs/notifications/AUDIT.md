# Garage OS — Smart Notification Engine V2 · Audit (Fase 1)

Tanggal audit: 3 Nov 2026 · Basis kode: `origin/main` a1a9d77 (setelah Production Hub V4, PR #154/#156/#157/#158).
Metode: membaca kode langsung (grep semua sumber event, pemicu, langganan, cron, tabel, pemutar suara, TTS, service worker).
Prinsip: **satu event → penerima benar → perangkat benar → aksi benar**.

Legenda bukti: **[V]** = terverifikasi dari kode (baris dikutip) · **[S]** = dugaan, perlu uji runtime.
Prioritas: **P0** = salah kirim / salah info uang / event kritis hilang · **P1** = dobel, bocor, tanpa aksi · **P2** = kebersihan, UX, observabilitas.

---

## 1. Peta mekanisme notifikasi yang ADA

| # | Mekanisme | Lokasi | Sifat |
|---|---|---|---|
| M1 | Feed staf `staff_notifications` + `staff_notification_reads` | `src/db/schema.ts:3675`, `src/lib/staff-notifications.ts` | Persisten, per outlet, audience berbasis peran, `dedup_key` unik, retensi 14 hari (`pruneStaffNotifications`, dipanggil sweeper menit ke-7 tiap jam, `src/instrumentation-node.ts`) |
| M2 | Lonceng `StaffNotificationCenter` | `src/components/garage/staff-notification-center.tsx` | Poll 30 dtk + SSE, ding + voice per kind, ulang ding urgent tiap 45 dtk maks 5×, toast, badge judul tab |
| M3 | SSE "ada perubahan" | `src/lib/production-events.ts`, `src/app/api/production/stream/route.ts`, `src/lib/use-production-stream.ts` | Bus in-memory single-process, tanpa payload, coalesce 250 ms; klien re-fetch lewat API ber-RBAC |
| M4 | Web Push staf | `src/lib/web-push-sender.ts`, `src/lib/garage-push-service.ts`, `public/sw.js`, `src/lib/push-client.ts`, `/api/push/subscribe` | VAPID, per user (bukan per perangkat/outlet), dihapus saat 404/410 |
| M5 | Web Push pelanggan per order | `order_push_subscriptions`, `sendOrderPush` (`web-push-sender.ts:123`) | Status pesanan ke HP pelanggan |
| M6 | Mesin suara klien `voice` | `src/lib/garage-voice.ts` (1.422 baris) | Web Speech + MP3 statis + oscillator; dedup **in-memory per tab**, cooldown 3,5 dtk (`checkAndUpdateCooldown`, `:1040`) |
| M7 | Suara Production Hub | `src/components/garage/production-hub/use-hub-sound.ts` | Tone tiket baru/telat, voice transisi, pengingat READY ≥3 mnt |
| M8 | Suara POS | `src/components/garage/pos-view.tsx` (`:1642`, `:1808`, `:3317`, `:3788`, `:3796`) | Bunyi QR, voice "order baru → Bar/Dapur", voice selisih kas |
| M9 | Waiter view | `src/components/garage/waiter-view.tsx:166-176`, `src/lib/waiter-notify.ts` | Tone + getar + notifikasi OS untuk panggilan meja (service request) |
| M10 | Badge Persetujuan | `src/components/garage/garage-app.tsx:405-440` | Poll `/api/approvals/stats`, voice `approval_pending` saat jumlah naik |
| M11 | Voice stok menipis | `garage-app.tsx:645-665` | Diff SKU `low` dari data bootstrap |
| M12 | AI Alerts bell | `src/components/garage/garage-ai-alerts-bell.tsx` | Poll `/api/ai/alerts`, voice `ai_alert_high` |
| M13 | Ops Center ding | `src/components/garage/ops-center-view.tsx:121-131` | Ding saat level naik ke rush/kritis |
| M14 | WMS drawer | `src/components/wms/wms-notifications-drawer.tsx`, `getWmsNotifications` (`src/lib/wms-service.ts:6029`) | Dihitung saat drawer dibuka; tanpa persistensi/push |
| M15 | WMS closing/replenishment | `getClosingNotifications` (`src/lib/wms-replenishment.ts:354`) | Diturunkan dari dokumen hidup, pull-only |
| M16 | System alert VPS | `src/lib/system-alert.ts`, `/api/jobs/system-alert` | `notifyStaff` audience `user` per Owner, dedup 1×/jam/cek |
| M17 | Aya reminders | `src/lib/aya-reminders.ts` | Saring alert Control Center per peran/stasiun (tanpa nominal uang) |
| M18 | Smart-notif trigger API | `src/app/api/smart-notif/trigger/route.ts`, `src/lib/smart-notif-service.ts` | Resolve URL MP3 + log `notification_logs`; **tidak dipanggil UI mana pun** |
| M19 | Tiket SELESAI (print) | `print_jobs` (`production-completion-print.ts`) | Antrean cetak durable — bukan notifikasi, tapi event "order selesai" |
| M20 | Pengumuman Owner via AI | `agent-tools-marketing.ts:179` | `notifyStaff` audience bebas |

### Pemanggil `notifyStaff` (semua sumber server) [V]

| Kind | Sumber | Audience | Dedup |
|---|---|---|---|
| `service_call/bill/water/move/other` | `garage-service.ts:7869` (`createServiceRequest`) | waiter | `service:<id>` |
| `chat` | `garage-service.ts:8104` | cashier | `chat:<thread>:<bucket 2 mnt>` |
| `takeaway_ready` | `garage-service.ts:8447` (`announceOrderProgress` all_ready) | cashier | `takeaway_ready:<order>` |
| `delivery_arrived` | `garage-service.ts:8470` | cashier | `delivery_arrived:<order>` |
| `qr_new` | `garage-service.ts:9999` (`createCustomerOrder`) | cashier | `qr_new:<order>` |
| `courier_assigned` | `garage-courier.ts:283` | user (kurir) | `courier_assigned:<order>:<user>` |
| `unpaid_expiring` / `auto_rejected` | `garage-courier.ts:620/641` (sweeper tiap menit) | cashier | per order |
| `staff_access_request` | `staff-access.ts:141` | management | per request+updatedAt |
| `material_request` | `wms-material-request.ts:149`, `:279`, `:288` | management / **production** | `mrq:<id>` dll |
| `system_alert` | `system-alert.ts:78` | user (Owner) | per cek per jam |
| `owner_announcement` | `agent-tools-marketing.ts:179` | pilihan | **tanpa dedup** |

---

## 2. Status per modul

| Modul | Notifikasi yang ada | Status |
|---|---|---|
| POS / kasir / pembayaran | `qr_new`, `chat`, `unpaid_expiring`, `auto_rejected`, `takeaway_ready`, `delivery_arrived`; bunyi QR POS; voice printer | Ada, sebagian |
| Production / KDS (Bar & Dapur) | SSE + tone tiket baru/telat + voice transisi + pengingat READY (M7); antrean cetak SELESAI | Ada, routing suara bermasalah |
| Waiter / meja | Service request (feed + M9) | Ada; **"siap antar" tidak terkirim** (lihat F-03) |
| Digital Menu / Smart QR | `qr_new` ke kasir; chat pelanggan; push pelanggan per order | Ada. Catatan: checkout pelanggan **masih aktif di kode** (`/order`, `/api/customer/orders`) — aturan "menu digital hanya lihat" belum ditegakkan; butuh keputusan Owner, tidak diubah di sini |
| Pickup | `takeaway_ready` ke kasir + push pelanggan; Hub AMBIL/`serve_direct` | Ada; **tidak ada speaker panggilan pickup khusus** → NOT IMPLEMENTED |
| Shift / kas | Approval `APP-CASH-*` (review/critical), voice `cash_anomaly` di perangkat kasir, panel tutup shift (meja aktif + QR pending), Kontrol Kas Owner (pull) | Ada; **tanpa notifikasi ke manajemen** (F-08) |
| WMS / inventory / opname | Drawer WMS (pull), voice stok menipis, Minta Bahan (feed) | Sebagian; opname review / PO approval / bahan memblokir produksi **tanpa notifikasi** |
| Purchasing / supplier | — | NOT IMPLEMENTED (PO pending_approval hanya terlihat di halaman PO) |
| Finance / laporan | Risk alerts (B6) di panel, tanpa push | Pull-only |
| CRM / member / loyalty | `upgradeNotification` = pesan di respons API, bukan notifikasi staf | NOT IMPLEMENTED (sebagai notifikasi) |
| Event & Undangan Digital | — | NOT IMPLEMENTED |
| Konten / iklan | Pengumuman Owner via AI tool | NOT IMPLEMENTED (selain pengumuman) |
| Owner Dashboard | System alert (push Owner), AI alerts bell, Ops Center ding, Kontrol Kas | Ada, terpecah di 4 tempat |
| Settings / security / monitoring | `notificationPushEnabled`, `approvalPollIntervalSec`, `newOrderSound`, voice settings per perangkat | Ada; tanpa health/routing log |

---

## 3. Temuan

### P0

**F-01 · Audience "production" tidak membedakan Bar dan Dapur [V]**
`audiencesFor` (`staff-notifications.ts:39-50`) memberi audience `production` untuk SEMUA workstation bar/dapur/helper. Pemanggil nyata: `wms-material-request.ts:279` "Bahan Bar dikirim gudang" → muncul + push di perangkat Dapur juga (dan sebaliknya).
Risiko: salah stasiun, kebisingan, staf menekan "Terima" di dokumen divisi lain. Double-send: tidak. Cross-role leak: ya (antar stasiun).

**F-02 · Voice "order baru → Bar / Dapur" diputar di perangkat KASIR [V]**
`pos-view.tsx:3788-3801` memanggil `voice.announce("order_new_kitchen")` dan `("order_new_bar")` setelah order POS tersimpan — di speaker kasir, bukan di stasiun. Hub stasiun sendiri hanya memutar tone generik (`use-hub-sound.ts:121`).
Risiko: stasiun yang benar tidak mendapat voice; kasir mengumumkan pekerjaan dua stasiun. Bisa dimatikan per perangkat lewat Voice Settings (scenariosEnabled), tapi default ON.

**F-03 · "Siap · Panggil" menampilkan "Waiter dipanggil." padahal tidak ada notifikasi ke waiter [V]**
`productionReadyAndCall` → `handoverKitchenTicketImpl` (`garage-service.ts:12377-12436`) hanya set `handover_at` + audit log; tidak ada `notifyStaff`. `waiter-view.tsx:155-158` secara eksplisit tidak memuat tiket siap antar. Satu-satunya jejak = pengingat voice di perangkat stasiun setelah 3 menit (`use-hub-sound.ts:137-149`).
Risiko: **event kritis gagal diam-diam** dengan pesan sukses menyesatkan; pesanan dingin.

**F-04 · Voice "pesanan siap" per tiket stasiun, bukan per pesanan [V]**
`use-hub-sound.ts:117-119` mengumumkan `order_ready` setiap tiket berubah ke READY. Order campuran (Bar+Dapur) → diumumkan saat Bar siap padahal Dapur belum, lalu diumumkan lagi. Server sudah benar (`garage-service.ts:12918-12935` hanya `all_ready` saat semua tiket siap) — klien tidak.

**F-05 · Perangkat stasiun bisa bersuara untuk stasiun lain [V]**
Filter suara Hub memakai `area` tampilan (`use-hub-sound.ts:101`, `:127`, `:141`). Staf Bar yang memilih Area "Semua" (`production-hub-v4.tsx:580-592`) ikut mendengar tiket/telat/pengingat Dapur.

**F-06 · Dedup suara hanya per tab, in-memory [V]**
`checkAndUpdateCooldown` (`garage-voice.ts:1040`) memakai `Map` modul + cooldown 3,5 dtk. Dua tab pada perangkat yang sama → bunyi dobel. `playDing` di lonceng (`staff-notification-center.tsx:120`, `:190`) tidak di-dedup sama sekali.
Skenario 5 (multi-tab) gagal; skenario 6 (refresh) aman untuk lonceng & Hub (muat pertama tidak berbunyi), tapi badge Persetujuan memakai kunci `approval-bump-<jumlah>` sehingga setiap tab berbunyi.

**F-07 · Langganan push tidak dilepas saat logout (perangkat bersama) [V]**
`signOut` (`garage-app.tsx:739`, `wms-shell.tsx:147`) tidak memanggil `DELETE /api/push/subscribe` maupun `pushManager.unsubscribe()`. Endpoint tetap milik user lama → push Owner (system alert, chat, order + nama pelanggan) terus muncul di layar kunci tablet yang kini dipakai Kasir/Waiter. Lonceng juga menampilkan "Notifikasi HP aktif" berdasarkan langganan browser, bukan milik user aktif (`staff-notification-center.tsx:205-221`).

**F-08 · Pembayaran: teks notifikasi bisa terbaca "sudah bayar" [V]**
`qr_new` body = `"<nama> · QRIS"` (`garage-service.ts:9993-9996`); untuk dine-in tidak ada penanda "belum diverifikasi". Model status (`payment-status.ts`) sudah benar (Pending sampai kasir konfirmasi), tapi label notifikasi tidak. QRIS di POS = konfirmasi manual kasir (tidak ada verifikasi otomatis) — tidak pernah diberi label "verifikasi manual".

### P1

**F-09 · Selisih kas review/critical tidak memberi tahu manajemen [V]** — `closeCashSession` (`garage-service.ts:19343-19361`) hanya membuat approval `APP-CASH-*`; Manajer tahu lewat poll badge 60 dtk. Voice `cash_anomaly` diputar di perangkat **kasir** (`pos-view.tsx:3315-3319`), komentar kode menyebut "supaya Manager tahu" — perangkatnya salah.

**F-10 · Waiter mendapat bunyi dobel untuk satu panggilan meja [V]** — `waiter-view.tsx:170-175` (tone+getar+OS) dan lonceng (`staff-notification-center.tsx:120-121`, ding + voice `waiter_call`) bereaksi pada service request yang sama di perangkat yang sama.

**F-11 · Notifikasi tidak punya status "selesai" [V]** — tabel hanya punya read per user; tidak ada `resolved_at`/`expires_at`. `qr_new` tetap "Order baru …" setelah diterima/ditolak; panggilan meja tetap urgent setelah diselesaikan; pengulangan ding urgent (maks 5×) tetap jalan sampai dibaca walau kejadian sudah tidak relevan (skenario 7 & 15).

**F-12 · Voice stok menipis spam per SKU di setiap perangkat yang memuat inventori [V]** — `garage-app.tsx:651-660` announce satu per SKU, tanpa pengelompokan, di semua peran yang memuat `inventoryItems`.

**F-13 · WMS: alert tidak lengkap & terpotong diam-diam [V]** — `getWmsNotifications` memotong low stock ke 5 tanpa "+N lagi", tidak mencakup Minta Bahan pending, PO menunggu approval, opname menunggu review, atau bahan yang memblokir resep; tidak ada push.

**F-14 · Race "semua siap" [V, dikoreksi]** — Analisis ulang: pengecekan sibling di `updateKitchenStatus` berjalan SETELAH update tiket sendiri ter-commit, jadi stasiun yang membaca terakhir selalu melihat semua siap → event **tidak bisa hilang**. Risiko sebenarnya kebalikannya: dua stasiun READY bersamaan, atau tiket dibuka ulang lalu READY lagi, mengumumkan `all_ready` dua kali (chat + push pelanggan dobel; `takeaway_ready` sudah aman lewat dedup). Diperbaiki di Tahap 1.1.

**F-15 · Lonceng ter-mount dua kali — TIDAK TERBUKTI [V]** — Tiga lonceng ada di cabang yang saling eksklusif: header `!isPosMode` (`garage-app.tsx:953`), header POS non-Kasir (`isPosMode && !isCashierPosMode`, `:1196`), dan POS Kasir (`pos-view.tsx`, `role === "Kasir"`). Tidak perlu perubahan.

**F-22 · Aya V2 bisa menghapus pengumuman operasional yang mengantre [V, ditemukan saat merge main 4 Nov 2026]** — `aya-sound.ts` (PR #169) memanggil `speechSynthesis.cancel()` saat Aya mengucapkan kalimat berikutnya / dihentikan. `cancel()` mengosongkan SELURUH antrean, termasuk pengumuman order yang sedang menunggu di belakang kalimat Aya → pengumuman hilang tanpa jejak (hanya di perangkat yang suara Aya-nya dinyalakan; staf default mati). Diperbaiki: `ayaMayCancel` (Aya hanya cancel bila tidak ada ucapan lain mengantre; bila ada, Aya mengalah) + `voice.announce` menghentikan Aya lebih dulu (suara operasional selalu menang).

### P2

**F-16** `/api/smart-notif/trigger` tidak dipakai UI, menerima POST dari staf mana pun dan menulis `notification_logs` tiap panggilan (tanpa rate limit); respons tidak memakai format `{ data }`. [V]
**F-17** `owner_announcement` tanpa `dedupKey` → retry agen menggandakan pengumuman. [V]
**F-18** Push dikirim ke SEMUA langganan user (bukan perangkat stasiun); push tidak tahu workstation perangkat. [V]
**F-19** Tidak ada indikator kesiapan audio browser terpusat / tombol Tes Suara per stasiun di Hub (ada di Voice Settings dialog). [V]
**F-20** Notifikasi tersebar di 4 lonceng/panel (staf, AI, WMS, Ops) tanpa routing log/health untuk Owner. [V]
**F-21** SSE single-process: bila kelak multi-instance, event hilang antar instance (polling 30 dtk tetap menutup). [V, risiko desain]

---

## 4. Ringkasan risiko vs target

| Target | Status sebelum V2 |
|---|---|
| Nol salah stasiun | Gagal — F-01, F-02, F-05 |
| Nol audio dobel | Gagal — F-04, F-06, F-10 |
| Nol "pembayaran sukses" palsu | Berisiko — F-08 |
| Nol item aksi basi | Gagal — F-11 |
| Event kritis tidak gagal diam-diam | Gagal — F-03, F-09, [S] F-14 |
| Realtime P95 ≤ 5 dtk | SSE 250 ms coalesce + debounce 500 ms + fetch; belum diukur di produksi |

Lihat `EVENT-MATRIX.md` (per event), `ARCHITECTURE.md` (desain), `IMPLEMENTATION-PLAN.md` (urutan & status).
