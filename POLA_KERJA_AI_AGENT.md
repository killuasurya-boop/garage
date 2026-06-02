# POLA KERJA AI AGENT — Garage OS

> Dokumen panduan **alur kerja AI Agent** untuk Garage Coffee & Motor OS.
> Tujuan: pola kerja terstruktur 3 fase (Develop → Cek Kesiapan → Cek Data Pre-Deploy) sampai **Final MVP** — agar pekerjaan tidak berantakan.
>
> Referensi:
> - `CLAUDE.md` (instruksi project)
> - `GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md` (checklist fitur)
> - `panduan_deploy_aplikasi_mvp_ke_vps.md` (panduan deploy)
> - `STRUKTUR APLIKASI.MD` (struktur modul)

---

## 0. PRINSIP UTAMA

```txt
[ ] Setiap fitur harus terhubung ke ekosistem Garage OS, bukan modul terisolasi.
[ ] Setiap fitur wajib lulus Definition of Done (DoD) sebelum dianggap selesai.
[ ] Jangan lanjut ke fase berikutnya jika fase sebelumnya belum lulus checklist.
[ ] Setiap aksi penting wajib masuk audit log.
[ ] Setiap perubahan wajib lulus build & lint.
[ ] Setiap fitur wajib responsive desktop/tablet/mobile.
[ ] Tema Garage (asphalt/chrome/red/amber) tidak boleh diganti gaya SaaS generik.
```

Aliran fase:

```
FASE 1: DEVELOPMENT MAKSIMAL
        ↓ (semua checklist DoD lulus)
FASE 2: CEK KESIAPAN (READINESS AUDIT)
        ↓ (no-go items diperbaiki)
FASE 3: CEK DATA PRE-DEPLOY
        ↓ (data bersih + backup siap)
FINAL MVP READY
```

---

# FASE 1 — DEVELOPMENT MAKSIMAL PER FITUR

> Setiap kali AI Agent menerima tugas fitur, jalankan **siklus 15 langkah** ini sebelum menyatakan fitur selesai.

## 1.1 Siklus Kerja Per Fitur

```txt
[ ] 1.  Identifikasi tujuan bisnis fitur
[ ] 2.  Identifikasi role pengguna yang berhak
[ ] 3.  Identifikasi modul terkait (cross-modul integration)
[ ] 4.  Cek dampak ke database (schema Drizzle)
[ ] 5.  Cek dampak ke API Route Handler
[ ] 6.  Cek dampak ke permission matrix
[ ] 7.  Cek dampak ke UI responsive (desktop/tablet/mobile)
[ ] 8.  Cek dampak ke finance/inventory/audit bila relevan
[ ] 9.  Implementasi bertahap (UI → API → DB)
[ ] 10. Tambahkan validasi Zod di semua endpoint
[ ] 11. Tambahkan auth check + permission check
[ ] 12. Tambahkan error handling konsisten
[ ] 13. Tambahkan loading/empty/error state UI
[ ] 14. Tambahkan audit log untuk aksi penting
[ ] 15. Jalankan testing checklist + build tidak rusak
```

## 1.2 Definition of Done (DoD) Per Fitur

Sebuah fitur **hanya boleh ditandai selesai** jika:

```txt
[ ] UI selesai dan rapi
[ ] Responsive desktop 1366x900
[ ] Responsive mobile 390x844
[ ] Database schema tersedia + migration berhasil
[ ] API Route Handler tersedia
[ ] Validasi Zod tersedia
[ ] Auth check tersedia
[ ] Permission check tersedia
[ ] Loading state tersedia
[ ] Empty state tersedia
[ ] Error state tersedia
[ ] Success toast tersedia
[ ] Audit log tersedia (untuk aksi penting)
[ ] Data terhubung ke modul lain (integrasi)
[ ] Tidak merusak modul lain
[ ] Test manual selesai
[ ] npm run lint lulus
[ ] npm run build lulus
[ ] Tidak ada console error
[ ] Siap untuk operasional nyata
```

## 1.3 Prioritas Eksekusi Modul (urutan kerja)

```txt
1.  Core architecture (DB, auth, role, layout shell)
2.  Auth + Session + Login (staff, POS, member)
3.  Role + Permission Matrix
4.  Dashboard basic
5.  POS core (menu, varian, cart, checkout)
6.  Product Management
7.  Payment + Receipt + Thermal Print
8.  Kitchen KDS
9.  Waiter
10. Sales History
11. Finance basic
12. Cash Closing
13. Inventory basic
14. CRM basic
15. Membership basic
16. Audit log
17. Settings
18. CEO Control + 2FA
19. Approvals / Risk Gate
20. Smart Notification
21. GARAGE AI
22. HR Attendance (geofence + selfie)
23. Shift Scheduler
24. Payroll / Kasbon
25. SOP / Training / Buku Pintar
26. Marketing / Campaign
27. Multi-outlet
28. Finance Anomaly
29. Inventory Intelligence
30. Security Hardening
31. Performance Optimization
32. Full Responsive Test
33. Full Role Test
```

## 1.4 Larangan Saat Development

```txt
[ ] JANGAN buat UI tanpa rencana backend
[ ] JANGAN buat endpoint tanpa Zod
[ ] JANGAN buat endpoint tanpa auth + permission
[ ] JANGAN buat modul terisolasi tanpa integrasi
[ ] JANGAN ubah finance tanpa audit log
[ ] JANGAN ubah inventory tanpa stock movement
[ ] JANGAN biarkan POS lambat di tablet
[ ] JANGAN biarkan mobile overflow
[ ] JANGAN bocorkan data finance ke role tidak berhak
[ ] JANGAN izinkan hapus audit log
[ ] JANGAN buat CEO Control tanpa 2FA
[ ] JANGAN ganti tema Garage menjadi SaaS generik
[ ] JANGAN buat build bergantung koneksi DB live
[ ] JANGAN tinggalkan dummy data tanpa arah production
```

## 1.5 Build Safety (wajib setiap akhir fitur)

```bash
npm run db:generate
npm run lint
npm run build
```

Jika salah satu gagal — **STOP, perbaiki, ulang**. Jangan lanjut ke fitur berikutnya.

---

# FASE 2 — CEK KESIAPAN (READINESS AUDIT)

> Dijalankan setelah semua fitur MVP/Master Pro lulus Fase 1.
> Tujuan: memastikan sistem siap dipakai operasional sebelum cek data deploy.

## 2.1 Readiness — Functional

```txt
[ ] Semua route utama bisa dibuka tanpa error
[ ] Login staff berhasil
[ ] Login POS berhasil
[ ] Login member berhasil
[ ] Semua role bisa login dan logout
[ ] Sidebar hanya menampilkan menu sesuai akses role
[ ] POS bisa buat transaksi end-to-end
[ ] Varian harga produk benar (single / Cold-Hot / Sedang-Pedas / Barbeque-Balado-Campur)
[ ] Receipt print + preview rapi
[ ] Order POS muncul di Kitchen KDS
[ ] Kitchen update status → muncul di Waiter
[ ] Waiter update delivered → status order selesai
[ ] Payment masuk Finance
[ ] Cash closing berjalan + selisih kas terdeteksi
[ ] Inventory adjustment menghasilkan stock movement
[ ] Low stock alert masuk Smart Notif
[ ] CRM auto-update saat ada transaksi member
[ ] Membership point/reward berjalan
[ ] Campaign bisa dibuat + target segment
[ ] Approval approve/reject berjalan
[ ] Audit log tercatat untuk aksi penting
[ ] HR attendance check-in dengan geofence + selfie
[ ] Shift scheduler bisa assign + handover
[ ] Payroll/kasbon bisa dihitung
[ ] SOP/Buku Pintar bisa dibaca staff
[ ] GARAGE AI memberi rekomendasi (bukan eksekusi tanpa approval)
[ ] Smart Notif sesuai role
[ ] Chat internal berjalan antar tim
```

## 2.2 Readiness — Security

```txt
[ ] Password tidak pernah disimpan plain text
[ ] Secret hanya di server (.env, bukan client bundle)
[ ] Session aman + auto logout untuk owner/admin
[ ] CEO Control wajib 2FA
[ ] Setiap halaman cek permission
[ ] Setiap API cek auth + permission
[ ] Setiap tombol aksi cek permission
[ ] Member hanya bisa lihat datanya sendiri
[ ] Role staff tidak bisa lihat data CEO vault
[ ] Data finance tidak bocor ke role tidak berhak
[ ] Audit log immutable secara prinsip (tidak bisa dihapus staff biasa)
[ ] Database purge sangat dibatasi + masuk approval
[ ] Input divalidasi Zod (XSS basic dicegah)
[ ] ORM Drizzle dipakai (SQL injection dicegah)
[ ] Rate limit endpoint login direncanakan
[ ] Error production tidak menampilkan stack trace
[ ] npm run audit script tidak menemukan critical issue
```

## 2.3 Readiness — Performance

```txt
[ ] POS cepat di tablet (load < 2s)
[ ] Cart update instant
[ ] Menu POS tidak berat
[ ] Dashboard tidak load semua data mentah
[ ] Report memakai pagination + filter
[ ] Query database dioptimasi + index di field penting
[ ] Komponen berat di-lazy load
[ ] Image asset dioptimasi (object-contain untuk logo wide)
[ ] KDS refresh aman (tidak rerender besar)
[ ] Mobile tetap ringan
[ ] Build size dipantau
```

## 2.4 Readiness — UI/UX

```txt
[ ] Tema asphalt-chrome-red-amber konsisten di semua modul
[ ] Tidak ada gaya SaaS generik (green/blue dominan)
[ ] Tombol primary jelas, destructive jelas
[ ] Badge status (low/watch/safe, paid/unpaid, dst.) mudah dikenali
[ ] Toast notification konsisten
[ ] Modal konfirmasi tersedia untuk aksi destructive
[ ] Empty state + loading skeleton + error state tersedia
[ ] Desktop 1366x900 aman (tidak ada overflow/clipping)
[ ] Mobile 390x844 aman
[ ] Tabel besar → card list di mobile
[ ] Print preview rapi
[ ] Logo wide pakai object-contain dengan backing chrome
[ ] prefers-reduced-motion dihormati
```

## 2.5 Readiness — Reliability

```txt
[ ] POS punya strategi offline queue minimal
[ ] Tidak ada double submit payment
[ ] Retry API aman + idempotent untuk aksi sensitif
[ ] Print receipt bisa diulang dengan tanda "REPRINT"
[ ] Client error reporter aktif
[ ] Health dashboard menampilkan status real
[ ] Backup script tersedia + sudah dites
[ ] Rollback plan tersedia
```

## 2.6 Readiness — Build & Test

```bash
npm run db:generate    # ✅ harus lulus
npm run lint           # ✅ harus lulus
npm run build          # ✅ harus lulus (tanpa koneksi DB live)
npm run db:migrate     # ✅ harus lulus di staging
npm run db:seed        # ✅ harus lulus
```

Browser test:
```txt
[ ] http://127.0.0.1:3000/ bisa dibuka
[ ] Login seeded berhasil
[ ] Desktop 1366x900 aman
[ ] Mobile 390x844 aman
[ ] Tidak ada console error
[ ] Tidak ada broken route
```

## 2.7 Readiness — Go / No-Go Gate

```txt
[ ] Semua section 2.1 ✅
[ ] Semua section 2.2 ✅
[ ] Semua section 2.3 ✅
[ ] Semua section 2.4 ✅
[ ] Semua section 2.5 ✅
[ ] Semua section 2.6 ✅

JIKA SEMUA ✅ → lanjut FASE 3
JIKA ADA ❌ → catat sebagai blocker, perbaiki, ulang Fase 2
```

---

# FASE 3 — CEK DATA PRE-DEPLOY

> Dijalankan setelah Fase 2 lulus. Tujuan: memastikan data bersih, environment siap, backup tersedia sebelum deploy.

## 3.1 Pembersihan Data

```txt
[ ] Tidak ada dummy data production yang tertinggal
[ ] Seed data hanya berisi data operasional/template (menu, varian, kategori, role)
[ ] Tidak ada akun test dengan password lemah di production
[ ] Tidak ada email/nomor HP karyawan dummy
[ ] Tidak ada outlet dummy
[ ] Tidak ada customer/member dummy
[ ] Tidak ada transaksi test di tabel orders/payments
[ ] Audit log staging tidak terbawa ke production
```

## 3.2 Validasi Data Master

```txt
[ ] Data outlet lengkap (nama, alamat, jam operasi, geofence)
[ ] Data produk lengkap (SKU, kategori, varian, harga, unit)
[ ] Data inventory lengkap (SKU, on_hand awal, min stock, unit, package_size)
[ ] Data supplier lengkap (jika dipakai)
[ ] Data role + permission matrix lengkap
[ ] Data user awal lengkap (owner, admin, manager, kasir, dst.)
[ ] Data SOP awal tersedia
[ ] Data company_settings lengkap (logo, kontak, NPWP jika perlu)
```

## 3.3 Environment Variable

```txt
[ ] .env production tidak masuk repository
[ ] .env.example tersedia + lengkap
[ ] DATABASE_URL production benar
[ ] BETTER_AUTH_SECRET kuat dan unik
[ ] BETTER_AUTH_URL sesuai domain production
[ ] Secret payment gateway (jika ada) production mode
[ ] SMTP/email config (jika ada) production mode
[ ] APP_URL = https://domain-production
[ ] NODE_ENV=production
[ ] File .env chmod 600 di VPS
```

## 3.4 Database Pre-Deploy

```txt
[ ] Schema Drizzle final
[ ] Migration sudah di-generate (npm run db:generate)
[ ] Migration sudah dites di staging
[ ] Tidak ada migration irreversible tanpa backup
[ ] Index dipasang di field penting (foreign keys, search, filter)
[ ] Constraint NOT NULL / UNIQUE / FK lengkap
[ ] Seed production aman dijalankan (idempotent)
[ ] Backup database staging berhasil
[ ] Rollback migration sudah diuji di staging
```

## 3.5 Backup & Rollback Plan

```txt
[ ] Script backup-db.sh tersedia + dites
[ ] Cron backup harian dikonfigurasi (jam 02:00 misal)
[ ] Retention backup 14 hari minimum
[ ] Backup terenkripsi jika berisi data sensitif
[ ] Script rollback.sh tersedia + dites
[ ] Backup folder /backups punya permission yang aman
[ ] Restore database sudah diuji di staging (bukan production)
```

## 3.6 Server / VPS Readiness

```txt
[ ] VPS spec sesuai (min 2 vCPU / 4GB RAM untuk MVP)
[ ] Ubuntu LTS terbaru
[ ] User deploy dibuat (bukan root)
[ ] SSH root login dimatikan
[ ] SSH password login dimatikan
[ ] Firewall UFW aktif (hanya 22, 80, 443)
[ ] Docker + Docker Compose terinstall
[ ] Nginx / Caddy reverse proxy terkonfigurasi
[ ] SSL HTTPS via Certbot aktif + auto-renew dites
[ ] DNS A record domain mengarah ke IP VPS
[ ] Folder /opt/apps/garage-os/ siap
[ ] Repo cloned + branch main checkout
[ ] docker-compose.yml siap (app + postgres + redis bila perlu)
```

## 3.7 Monitoring & Logging

```txt
[ ] Health check endpoint /api/health tersedia
[ ] Health endpoint cek koneksi DB
[ ] Log aplikasi terkumpul (docker compose logs)
[ ] Log Nginx access + error aktif
[ ] Error tracking (Sentry / equivalent) optional tapi disarankan
[ ] Uptime monitoring (Uptime Kuma / Better Stack) aktif
[ ] Alert channel (Telegram / email) disetel untuk owner
[ ] Tidak ada password/token/OTP di log
```

## 3.8 Security Hardening Pre-Deploy

```txt
[ ] Security headers Nginx aktif (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection)
[ ] Rate limiting Nginx untuk /api/auth/ aktif
[ ] CORS dibatasi ke domain yang dibutuhkan
[ ] CSP dasar disetel
[ ] Database tidak expose port publik (127.0.0.1 only)
[ ] Redis tidak expose port publik (jika dipakai)
[ ] CEO Control 2FA wajib aktif
[ ] Backup dienkripsi jika berisi data customer
[ ] Dependency npm audit clean (tidak ada high/critical)
```

## 3.9 Dokumentasi Final

```txt
[ ] CLAUDE.md up-to-date
[ ] STRUKTUR APLIKASI.MD up-to-date
[ ] GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md sudah di-tick
[ ] Panduan deploy VPS up-to-date
[ ] README untuk owner/admin tersedia
[ ] SOP penggunaan untuk kasir/waiter/kitchen tersedia di Buku Pintar
[ ] Template informasi server diisi (domain, IP, PIC, dst.)
[ ] Privacy Policy + T&C tersedia (jika ada area publik)
```

## 3.10 Go / No-Go Pre-Deploy Gate

```txt
[ ] Semua section 3.1 — 3.9 ✅
[ ] PIC technical + PIC product confirmed
[ ] Window deploy disepakati (jam sepi, bukan rush hour)
[ ] Tim standby untuk monitoring 24 jam pertama
[ ] Rollback plan dipahami semua PIC

JIKA SEMUA ✅ → DEPLOY
JIKA ADA ❌ → tunda deploy, perbaiki
```

---

# PASCA DEPLOY — VERIFIKASI FINAL MVP

## P.1 Smoke Test Production (T+0 sampai T+1 jam)

```txt
[ ] Domain HTTPS bisa dibuka
[ ] Login owner berhasil
[ ] Login kasir berhasil
[ ] Login member berhasil
[ ] Health endpoint /api/health → 200 OK
[ ] POS bisa transaksi 1x (test order kecil)
[ ] Receipt print berhasil
[ ] Order muncul di Kitchen KDS
[ ] Payment tercatat di Finance
[ ] Audit log mencatat transaksi test
[ ] Tidak ada error di docker compose logs
[ ] Tidak ada error di Nginx error.log
[ ] Backup database otomatis menjalankan run pertama
```

## P.2 Monitoring 24 Jam Pertama

```txt
[ ] CPU/RAM stabil (htop)
[ ] Disk usage aman (df -h)
[ ] Tidak ada container restart loop
[ ] Tidak ada error fatal di log
[ ] Uptime monitoring 100%
[ ] Owner menerima daily brief dari GARAGE AI
[ ] PIC technical responsif untuk insiden
```

## P.3 Final MVP Sign-Off

```txt
[ ] Owner mengkonfirmasi sistem dapat dipakai operasional
[ ] Kasir mengkonfirmasi POS lancar di shift nyata
[ ] Kitchen mengkonfirmasi KDS terbaca
[ ] Finance mengkonfirmasi closing harian akurat
[ ] HR mengkonfirmasi absensi geofence + selfie berjalan
[ ] Tidak ada blocker dalam 48 jam pertama
[ ] Backup hari pertama berhasil + bisa di-restore di staging

→ FINAL MVP READY ✅
```

---

# RINGKASAN ALUR KERJA

```
┌──────────────────────────────────────────────────────────┐
│ FASE 1: DEVELOPMENT MAKSIMAL                              │
│  • Siklus 15 langkah per fitur                            │
│  • DoD per fitur wajib lulus                              │
│  • Build safety setiap akhir fitur                        │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 2: CEK KESIAPAN (READINESS AUDIT)                    │
│  • Functional · Security · Performance                    │
│  • UI/UX · Reliability · Build & Test                     │
│  • Go/No-Go Gate                                          │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 3: CEK DATA PRE-DEPLOY                               │
│  • Pembersihan data · Validasi master                     │
│  • ENV · Database · Backup · Rollback                     │
│  • VPS · Monitoring · Security hardening · Dokumen        │
│  • Go/No-Go Pre-Deploy Gate                               │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ PASCA DEPLOY: VERIFIKASI FINAL MVP                        │
│  • Smoke test T+0..T+1                                    │
│  • Monitoring 24 jam pertama                              │
│  • Sign-off owner / kasir / kitchen / finance / HR        │
└────────────────────┬─────────────────────────────────────┘
                     ↓
              ✅ FINAL MVP READY
```

---

# ATURAN ANTI-BERANTAKAN

```txt
[ ] SATU fitur dikerjakan sampai DoD lulus, baru pindah ke fitur berikutnya.
[ ] JANGAN buka 5 modul sekaligus tanpa menyelesaikan satu pun.
[ ] SETIAP commit harus berkaitan dengan satu unit pekerjaan jelas.
[ ] SETIAP perubahan DB → migration → test → seed update bila perlu.
[ ] SETIAP perubahan API → update permission matrix bila perlu.
[ ] SETIAP perubahan UI → test desktop + mobile + console error.
[ ] SETIAP akhir hari kerja → npm run lint && npm run build harus hijau.
[ ] SETIAP fase punya gate Go/No-Go. JANGAN paksa lanjut jika ❌.
[ ] DOKUMENTASIKAN keputusan teknis penting di CLAUDE.md.
[ ] CATAT blocker di issue tracker, jangan ditampung di kepala saja.
```

---

## Catatan Akhir

Pola kerja ini adalah **tulang punggung disiplin AI Agent** dalam mengembangkan Garage OS. Tanpa disiplin fase, fitur akan menumpuk setengah jadi, integrasi rusak, dan deploy gagal di production.

Target akhir: **Final MVP Garage OS yang aman, cepat, responsif, terhubung, dan siap dipakai operasional nyata Garage Coffee & Motor.**
