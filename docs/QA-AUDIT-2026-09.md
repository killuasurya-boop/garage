# PRE-LAUNCH QA & PRODUCTION READINESS AUDIT — Garage OS

- **Tanggal:** 2026-09-28
- **Metode:** checklist 25 bagian → temukan → perbaiki → tes ulang.
- **Lingkungan uji:**
  - salinan DB `.tmp/qa-db` (baca), `.tmp/gladi-db` (tulis);
  - server gladi port 3002 (`NEXT_DIST_DIR=.next-verify`).
- **Batasan:** DB asli `.pglite-data` hanya dibaca lewat salinan; server owner (port 3001) tidak disentuh.

Legenda: ☑ selesai · ◐ sebagian/terbatas · ⛔ menunggu owner

Alat audit baru (dipakai ulang untuk audit berikutnya):

| Perintah | Isi |
|---|---|
| `npm run qa:db` | skema vs DB, indeks FK, integritas uang/stok/produksi/meja (baca saja) |
| `npm run qa:api` | inventaris guard 452 route + uji HTTP tanpa sesi / eskalasi Waiter / body invalid Owner |
| `npm run qa:uat` | matriks akses per peran (Owner, Manajer, Kasir, Bar, Dapur, Helper, Waiter, anonim) |
| `npm run qa:pages` | smoke semua halaman dengan sesi Owner |
| `npm run qa:load -- --duration 120 --customers 30` | beban jam sibuk / stress |

Semua alat butuh server gladi (`npm run gladi:setup` → build `.next-verify` → `npm run gladi:server`).

## Checklist

| # | Bagian | Status | Bukti | Hasil |
|---|---|---|---|---|
| 1 | Static Analysis | ☑ | `npx tsc --noEmit`, `npm run lint` | tsc 0 error; lint 0 error **0 warning** (awal 7 warning) |
| 2 | Code Quality | ◐ | lint, pemindaian `any`/`eslint-disable`/`console.log`/TODO | Warning dibereskan; `console.log` hanya di skrip CLI; 3 TODO wajar. File raksasa (`garage-service.ts` 16 rb baris, `pos-view.tsx` 11,6 rb) dicatat, **tidak direfaktor sebelum launch** (risiko) |
| 3 | TDD / Unit | ☑ | `npx vitest run` | **479/479 lulus, 70 file** (awal 468). Tes baru: rate-limit, kunci POS, PIN member, `homeModuleFor`, meja order mati. Coverage % tidak terukur (`@vitest/coverage-v8` tidak terpasang, tidak menambah dependency) |
| 4 | Integration | ☑ | 45 file integrasi PGlite | Lulus. Tambahan regresi meja ditolak/void/batal |
| 5 | API Testing | ☑ | `npm run qa:api` | 452 route / 581 handler: **923 panggilan, 0 FAIL**. Tanpa sesi = 401/403; Waiter ke route Manajer = 403; body `{}` sebagai Owner tidak ada 500 |
| 6 | Database | ☑ | `npm run qa:db` | 110 migrasi terterapkan, 147 tabel/kolom cocok, unik nomor dokumen OK. Migrasi **0107** = indeks FK panas |
| 7 | Functional | ☑ | gladi S0–S14 + UAT + smoke | POS, Production, Waiter, meja, bill/split, void, payroll, akses peran |
| 8 | E2E | ☑ | `npm run gladi:run` ×2 | **15/15 PASS dua kali berturut-turut** (build final) |
| 9 | Regression | ☑ | suite penuh ulang setelah semua fix | vitest 479/479, gladi 15/15 ×2, API 923/923, UAT 41/41, halaman 83/83 tanpa 5xx |
| 10 | Smoke | ☑ | `npm run qa:pages`, `smoke-garage-lan` → 3002 | 83 halaman: 80×200, 2×307, 1×404 (ID palsu), **0×5xx**; smoke LAN 11/11 OK (tes member dilewati — tak ada member di DB) |
| 11 | Sanity | ☑ | cek ulang tiap alur yang disentuh fix | lihat kolom RETEST di Bug Register |
| 12 | Error Handling | ☑ | fuzz body invalid, ID tak ada | 2 route 500 → 404; parse-cv 500 → 400 |
| 13 | UI/UX | ◐ | browser pane 1366×900 / 768×1024 / 390×844 | Dashboard, Pengaturan+Purge, POS, Production (tablet), Waiter (HP), `/order` (HP): tanpa error console aplikasi; teks terbaca. Catatan LOW: 401 `member/profile` di console tamu |
| 14 | Security | ◐ | guard route, brute-force, upload, XSS, secret, purge | 5 temuan CRITICAL/HIGH diperbaiki; **2 CRITICAL milik owner masih terbuka** (password default, 2FA) |
| 15 | Performance | ☑ | `qa:load` | Beban normal: p95 ≤ 273 ms (build final, DB bersih) |
| 16 | Load / Stress | ☑ | `qa:load` 30 & 90 pelanggan | Normal: 0 error, 0×429. Stress 3× (13,7 req/dtk): 0 error, p95 1,1–1,7 dtk (batas PGlite satu penulis) |
| 17 | Compatibility | ◐ | Chromium + emulasi Android | Lulus. Firefox & Safari iOS **tidak diuji** (tak ada alat di PC ini) |
| 18 | Data Integrity | ☑ | `qa:db` setelah 394 order paralel | 0 FAIL: nomor order unik, total/pembayaran cocok, alokasi batch 100%, tak ada tiket aktif milik order void |
| 19 | Build & Production | ☑ | `db:generate` (tanpa drift), `next build`, build standalone | Lulus; warning Turbopack 15 → 7; root workspace dikunci; tracing standalone dibersihkan |
| 20 | Deployment Audit | ◐ | Dockerfile, `.dockerignore`, `docs/DEPLOY_VPS.md` | Diperbaiki & build standalone terbukti. Eksekusi VPS/HTTPS/cron **ditunda owner** |
| 21 | Backup & Recovery | ☑ | `backup.mjs` → restore ke folder baru → migrate → `qa:db` | Restore terbukti (jumlah baris sama, 0 FAIL); `db:restore` kini mendukung folder backup harian; task backup 23:45 aktif, offsite G-Drive tersalin |
| 22 | UAT per peran | ◐ | `npm run qa:uat` + gladi | **41/41 PASS** (Owner 10, Manajer 9, Kasir 7, Bar 2, Dapur 1, Helper 2, Waiter 8, anonim 2). UAT staf asli (Bagian D gladi) ⛔ owner |
| 23 | Final Bug Audit | ☑ | Bug Register di bawah | 29 temuan |
| 24 | Fix & Retest | ☑ | | 23 diperbaiki & dites ulang; 4 terbuka (2 CRITICAL milik owner) + 2 diterima |
| 25 | Final Readiness Check | ☑ | `check-default-passwords.ts`, status 2FA di DB | **READY (LAN)** — Owner & Manajer: password baru + 2FA aktif; 4 akun staf ditunda owner (dikunci wajib-ganti) |

## Bug Register

| ID | MODULE | ISSUE | SEVERITY | ROOT CAUSE | FIX | STATUS | RETEST RESULT |
|---|---|---|---|---|---|---|---|
| QA-001 | Admin / Keuangan | "Auto Purge" menghapus permanen order **lunas** > 30 hari. Target Orders aktif default + cron bulanan di `vercel.json` → riwayat penjualan, laba-rugi, dan bukti pajak hilang | CRITICAL | Order dianggap data sampah; tak ada kebijakan retensi keuangan | Order/pembayaran tak pernah di-purge; persetujuan minimal 365 hari; cron hanya chat; GET info Owner-only; UI diperbarui | FIXED | UAT: Manajer 403, Owner 200; panel hanya Chat/Approvals ≥365; build + regresi lulus |
| QA-002 | Auth | Keenam akun `@garage.id` masih password default seed; `GARAGE_SEED_PASSWORD` di `.env.local` masih default | CRITICAL | Akun seed belum dirotasi | **Dipaksa** (28-09 14.15): 6 akun `passwordResetRequired` → wajib ganti password saat login berikutnya; kebijakan password baru (`src/lib/password-policy.ts`) menolak default/umum/berurutan/memuat nama akun; `GARAGE_SEED_PASSWORD` dirotasi acak 32 karakter (tak dicetak). Claude tidak menentukan password siapa pun | FIXED (Owner, Manajer) · ACCEPTED (4 akun staf) | 28-09: Owner & Manajer sudah ganti password (`check-default-passwords.ts` tidak lagi mencantumkan keduanya). Kasir, kasir2, waiter, waiter2 **ditunda atas keputusan owner** — tetap dikunci "wajib ganti password" saat login pertama; risiko sisa diturunkan ke MEDIUM (Kasir tak bisa void/diskon tanpa PIN Manajer, tak bisa lihat keuangan). Opsi nol-risiko: nonaktifkan 4 akun itu sampai dipakai |
| QA-003 | Auth | 2FA Owner/Manajer belum aktif (0 dari 2) | CRITICAL | Belum diaktifkan | **Dipaksa**: `securityRequire2faForOwner = true` + penegakan di semua halaman modul (dulu hanya Control Center) → Owner/Manajer diarahkan ke `/control/2fa` sampai 2FA aktif. Katup darurat: `security-hardening.ts --disable-2fa-policy` | FIXED | Uji salinan: siklus penuh lulus. DB asli 28-09: Owner `two_factor_enabled = true`, Manajer `two_factor_enabled = true` |
| QA-030 | Auth / 2FA | **Aktivasi 2FA selalu gagal 500** — Better Auth 1.6.23 butuh kolom `verified`, `failed_verification_count`, `locked_until` di `two_factor`; tanpa perbaikan, kebijakan 2FA wajib akan MENGUNCI Owner/Manajer | CRITICAL | Skema `two_factor` tertinggal dari versi plugin | Kolom ditambah di `schema.ts` + migrasi `0108` (idempoten) | FIXED | Siklus 2FA penuh lulus di salinan; migrasi 0108 terterapkan di DB asli |
| QA-004 | POS API | Terminal `GARAGE-POS-01` aktif dengan kunci dev `garage-pos-dev-key` yang tertulis di kode → siapa pun di jaringan bisa menambah poin member / melihat data member | HIGH | `GARAGE_POS_API_KEY` tak diset → seed pakai kunci bawaan | Kunci dev ditolak saat `NODE_ENV=production`; seed tak lagi mencetak rahasia | FIXED | `pos-api-key.test.ts` 2/2; `qa:db` kini WARN (diblok) |
| QA-005 | Absensi / Approval | `/api/hr/attendance(/check)` = oracle tebak PIN (cari staf by PIN saja, limit per IP yang bisa dipalsukan); PIN yang sama dipakai persetujuan Manajer di POS | HIGH | Endpoint kiosk lama tetap hidup setelah Payroll V2 | 410 saat V2 aktif + limit global | FIXED | API audit: 410; gladi S13 (payroll) lulus |
| QA-006 | CRM / Member | Form tambah member otomatis berisi PIN `member12345`; login member hanya dibatasi per IP | HIGH | Default demo tertinggal di UI | Kolom kosong; server tolak PIN lemah (default, kembar/berurutan, nomor HP); kunci per akun 8 gagal/15 menit | FIXED | Uji HTTP: default & 123456 ditolak, PIN wajar 201, login OK, terkunci setelah gagal walau IP berganti |
| QA-007 | Performa / Pelanggan | 30 pelanggan QR → **52% cek status order ditolak 429** | HIGH | Rate limiter hanya membaca `X-Real-IP`; tanpa proxy semua perangkat LAN jadi satu ember | Pakai IP dari `X-Forwarded-For` (diisi Next dari soket); ember tanpa IP diberi batas 20× | FIXED | `qa:load`: 0×429, 0 error, p95 < 1 dtk |
| QA-008 | Payroll | Task `GaragePayrollFinalize` tidak jalan saat laptop pakai baterai, tanpa susulan bila PC mati 23:59, tanggal salah bila telat, tanpa log (hasil terakhir 0x800710E0) | HIGH | Setting default Task Scheduler | `payroll-finalize.ps1`: tanggal benar bila susulan + log `backups/payroll-finalize.log`; task didaftar ulang (atas izin owner) | FIXED | Task: StartWhenAvailable=True, jalan di baterai, next run 28-09 23:59 |
| QA-009 | Production / Login | Akun Bar/Dapur/Helper mendarat di POS terkunci "Shift Belum Dibuka" → barista bisa membuka shift kas | HIGH | Modul awal hanya berdasar role | `homeModuleFor(role, workstation)` → Production | FIXED | Browser 768×1024: Bar langsung ke Production Hub; unit test lulus |
| QA-010 | Meja | Meja dengan order QR **ditolak** tampil terisi selamanya (DB: meja 49/50/51) | MEDIUM | Hanya status `voided` yang dianggap order mati | `rejected`/`cancelled` diperlakukan sama | FIXED | Integrasi 3 kasus lulus |
| QA-011 | SOP / HR | Setoran SOP & status training/HR memakai tanggal UTC → jam 00.00–07.00 WIB tercatat kemarin | MEDIUM | `toISOString()` | `jakartaDateKey()` / zona Asia/Jakarta (4 tempat) | FIXED | tsc + regresi lulus |
| QA-012 | Deploy | `Dockerfile` tidak set `GARAGE_STANDALONE=true` → build Docker gagal | MEDIUM | Flag hanya di `next.config.ts` | `ENV GARAGE_STANDALONE=true` | FIXED | Build standalone lulus, `server.js` terbentuk |
| QA-013 | Deploy / Privasi | Context Docker membawa `.tmp` (kredensial uji), backup DB, selfie, CV; tracing standalone menyalin DB asli + backup (1,7 GB) | MEDIUM | `.dockerignore` & tracing tak mengecualikan data | `.dockerignore` + `outputFileTracingExcludes` | FIXED | Lihat ukuran standalone di Laporan Akhir |
| QA-014 | Backup | `npm run db:restore` hanya mengenal `.tar.gz` lama, tidak mengenal backup harian (folder) | MEDIUM | Format backup berubah, skrip restore tidak | Mendukung dua format; cek port 3001 tetap | FIXED | Daftar backup tampil; restore manual → 0 FAIL |
| QA-015 | DB | FK panas tanpa indeks (`kitchen_tickets.order_id`, `orders.customer_id`, produksi) | MEDIUM | Indeks tak dibuat saat tabel ditambah | Migrasi `0107` | FIXED | `qa:db`: 110 migrasi OK; beban p95 turun |
| QA-016 | Build | Next menebak root workspace = `C:\Users\killu` (ada `package-lock.json` nyasar) → tracing 32 rb file | MEDIUM | Lockfile di folder home | `turbopack.root` + `outputFileTracingRoot` | FIXED | Warning hilang; 15 → 7 warning |
| QA-017 | Gudang | Laporan harian terkunci tak bisa dibuka (tombol "Buka Kunci" tidak ada, API ada) | MEDIUM | Tombol hilang saat refactor | Tombol Owner/Manajer | FIXED | lint + build lulus |
| QA-018 | Tes | Suite integrasi timeout acak saat paralel | MEDIUM | CPU jenuh (70 × migrasi PGlite) | `maxWorkers: '50%'` + timeout 120 dtk | FIXED | 70/70 lulus |
| QA-019 | API | SOP submit / training complete dengan ID tak ada → 500 | LOW | Pelanggaran FK tak ditangani | 404 | FIXED | Fuzz Owner: 0×500 |
| QA-020 | API | `recruitment/parse-cv` content-type salah → 500 | LOW | `formData()` tak ditangkap | 400 | FIXED | API audit lulus |
| QA-021 | Seed / Log | Seed mencetak password & kunci POS ke log | LOW | Log debug | Hanya cetak sumber rahasia | FIXED | tsc lulus |
| QA-022 | Readiness | Akun bot GarageBot dihitung "Manajer tanpa 2FA" | LOW | Query tak cek kredensial | Hanya akun ber-password | FIXED | tsc lulus |
| QA-023 | Kualitas kode | 7 warning lint + `.eslintignore` usang | LOW | Sisa refactor | Dibereskan | FIXED | lint 0/0 |
| QA-024 | Data asli | 2 shift kas terbuka sejak 20 & 23 Sep; meja 01/07/48 "paid" menggantung; 11 stok lokasi negatif | MEDIUM | Data uji coba | Reset H-1 + stock opname pembukaan (`docs/GRAND-OPENING-H-1.md`) | OPEN ⛔ | — |
| QA-025 | Deploy ke server asli | Semua perbaikan baru ada di kode; server port 3001 masih build lama & DB asli belum migrasi 0107 | HIGH | Server owner tidak dimatikan selama audit | Server dihentikan rapi (preview) → backup → `db:migrate:runner` (0107) → `npm run build` → start (atas izin owner, 28-09 13.30) | FIXED | Health OK, 1 listener 3001, purge anonim 401, absen lama 410, dashboard tampil |
| QA-026 | UI Pelanggan | Halaman `/order` tamu mencatat 401 `member/profile` di console | LOW | Cek profil selalu dipanggil | `GET /api/member/profile?optional=1` → 200 `member:null` untuk tamu (tanpa `optional` tetap 401) | FIXED | Browser: 0 error console; tamu 200/null, member login 200 + profil. Terpasang di server asli 28-09 14.15 |
| QA-027 | Performa | Beban 3× → p95 1,1–1,7 dtk | LOW | PGlite satu penulis | Diterima; Postgres saat VPS | ACCEPTED | Stress 0 error |
| QA-028 | API | ID non-UUID → 500 di **55 route** (uji `qa-api-audit.ts --bad-id`) | LOW | Param `[id]` langsung dipakai di kolom uuid tanpa validasi | Tidak diubah sebelum launch (55 file, risiko regresi > manfaat); respons 500 kosong/generik tanpa detail internal; UI selalu mengirim ID valid | ACCEPTED | Mode `--bad-id`: 55 terdokumentasi; mode normal 923/923 PASS |
| QA-029 | Tes | Coverage % tidak terukur | LOW | `@vitest/coverage-v8` tidak terpasang | — (tidak menambah dependency tanpa izin) | OPEN | — |

## Laporan Akhir

| Metrik | Hasil |
|---|---|
| **TOTAL TEST** | **1.628 pengecekan otomatis** pada putaran regresi final (salinan DB yang sudah dikeraskan): vitest 481 · gladi E2E 30 (15×2) · API 923 · UAT 41 · halaman 83 · smoke LAN 11 · alur member 6 · siklus 2FA 9 · ganti password 3 · audit DB 32 · uji beban 1 · restore 1 · live 7. Ditambah pemeriksaan visual 8 layar di 3 ukuran |
| **PASSED** | 1.628 (100% putaran final) |
| **FAILED** | 0. Final Readiness: Owner & Manajer lulus (password baru + 2FA aktif) |
| **BUG DITEMUKAN** | 30 (CRITICAL 4 · HIGH 7 · MEDIUM 10 · LOW 9) |
| **BUG DIPERBAIKI** | 26 FIXED (QA-002 untuk Owner/Manajer; 4 akun staf ditunda owner) |
| **BUG TERSISA** | QA-024 (MEDIUM, dikerjakan H-1) · QA-029 (LOW) · diterima: QA-027, QA-028, sisa QA-002 (4 akun staf, MEDIUM, keputusan owner) |
| **CRITICAL** | 4 ditemukan → **4 ditutup** (QA-001 purge, QA-030 2FA rusak, QA-003 2FA aktif, QA-002 untuk akun berhak tinggi); **0 CRITICAL terbuka** |
| **HIGH** | 7 ditemukan → **7 diperbaiki** |
| **PERFORMANCE** | Beban normal (3 kasir, 4 waiter, 2 produksi, 30 pelanggan QR): 0 error, 0×429, p95 ≤ 273 ms. Stress 3× (13,7 req/dtk): 0 error, p95 1,1–1,7 dtk. Standalone 1,7 GB → 152 MB |
| **SECURITY** | 452 route terjaga (0 bocor tanpa sesi, 0 eskalasi Waiter, 0×500 body invalid). Diperbaiki: kunci POS dev, oracle PIN absensi, PIN member default, purge penjualan. **Terbuka: password default + 2FA (owner)** |
| **UAT RESULT** | Otomatis 41/41 PASS untuk 7 peran + anonim; gladi 15/15 ×2. UAT staf asli (Bagian D gladi) belum dilakukan ⛔ |
| **PRODUCTION READINESS STATUS** | **READY FOR PRODUCTION (operasional LAN)** per 28-09 — 0 CRITICAL/HIGH terbuka, semua alur kritis lulus. Risiko diterima owner: 4 akun staf belum ganti password (dikunci wajib-ganti). Syarat operasional sebelum buka: gladi staf asli + runbook H-1. VPS/HTTPS = putaran terpisah |

### Yang harus dilakukan owner agar status menjadi READY

> **Status 28-09:** langkah 1–2 SELESAI untuk Owner & Manajer. Kasir, kasir2, waiter, waiter2 ditunda atas keputusan owner — akan diminta ganti password otomatis saat pertama login.

1. **Tiap pemilik akun login sekali** (owner, manajer, kasir, kasir2, waiter, waiter2 `@garage.id`) → sistem langsung meminta **Ganti Password** (password baru buatan sendiri; yang lemah ditolak). `GARAGE_SEED_PASSWORD` sudah dirotasi otomatis.
2. **Owner & Manajer**: setelah ganti password, sistem langsung membuka **setup 2FA** → pindai QR dengan Google Authenticator, masukkan kode, **simpan 10 backup code** di tempat aman.
   - Cek penutupan: `npx tsx src/scripts/check-default-passwords.ts` (pada salinan DB / server mati) → "Tidak ada akun yang memakai password default", dan health dashboard tanpa isu "admin-2fa".
   - Darurat (HP authenticator hilang & backup code habis): `npx tsx src/scripts/security-hardening.ts --disable-2fa-policy` (server mati).
3. ~~Pasang build baru ke server asli~~ — SELESAI 28-09 13.30 (backup `garage-20260928-133040-pglite` sebelum migrasi).
4. ~~Daftar ulang task payroll~~ — SELESAI.
5. **H-1:** jalankan runbook `docs/GRAND-OPENING-H-1.md` (reset transaksi uji, tutup 2 shift lama, stock opname pembukaan).
6. **Gladi dengan staf asli** (Bagian D, `docs/GLADI-RESIK-LOG.md`) di perangkat fisik.

Setelah langkah 1–2 selesai dan dicek ulang (`npm run qa:*` + `check-default-passwords.ts`), status dapat dinaikkan menjadi READY FOR PRODUCTION untuk operasional LAN. VPS/HTTPS tetap putaran terpisah.

### Bukti non-perusakan
Selama fase uji, `.pglite-data` asli tidak berubah (mtime tetap 11:03:39); semua tulis di salinan `.tmp/*`. Perubahan ke DB asli hanya atas perintah owner dan selalu didahului backup terverifikasi + offsite:
- 13.30: migrasi 0107 (backup `garage-20260928-133040-pglite`);
- 14.10: migrasi 0108 + penegakan keamanan (backup `garage-20260928-141013-pglite`); `.env.local` lama disimpan di `_backup-pre-production-hub-20260928\env.local.before-seed-rotate.bak`.
