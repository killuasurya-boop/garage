<!--
Disalin verbatim dari pesan Owner (Surya) di sesi Claude Code 2026-10-25/26.
Ini adalah SINGLE SOURCE OF REQUIREMENTS yang menggantikan S1/S2/S3 (3 PDF).
Keputusan Owner yang menimpa sebagian isi dokumen ini dicatat di
docs/master-2026/06-OWNER-DECISIONS.md (mis. D-01 full access MCP ChatGPT).
Jangan ubah isi di bawah tanpa izin Owner; tambahkan versi baru sebagai file baru.
-->

# GARAGE OS — MASTER PRD UNIFIED V4.0

**Garage Coffee / GARAGE TEBING TINGGI**
**AI Command Center + MCP · Financial Control & Smart Closing · Identity & Access Security · UI/UX Transformation**

| Atribut | Ketetapan |
|---|---|
| Kode dokumen | PRD-GOS-UNIFIED-2026-004 |
| Versi | 4.0 (gabungan) |
| Tanggal | 26 Oktober 2026 |
| Pemilik produk | Surya — Owner Garage Coffee |
| Outlet awal | GARAGE TEBING TINGGI (desain siap multi-outlet melalui scope/permission) |
| Aplikasi | Garage OS — `garagecoffee.id`, VPS existing |
| Stack terverifikasi (source) | Next.js 16 · TypeScript · React 19 · Drizzle ORM · PostgreSQL (`pg`) · Better Auth (+ twoFactor TOTP) · Vitest · PDFKit · ExcelJS |
| Status | **RANCANGAN / FOR OWNER REVIEW.** Bukan bukti fitur sudah terpasang, bukan hasil audit production, bukan hasil UAT. |
| Batas dokumen | Tidak ada perubahan kode, database, VPS, pembayaran, harga, permission, atau koneksi ChatGPT production pada tahap ini. |

> **STATUS AKHIR:** Dokumen ini adalah *single source of requirements* Garage OS. Belum ada klaim koneksi ChatGPT, akses database live, Drive, Gmail, WhatsApp OTP, maupun fitur yang sudah diterapkan. Semua angka contoh adalah **simulasi**, bukan data Garage Coffee.

---

## DAFTAR ISI

- [00. Kontrol dokumen, sumber & hierarki keputusan](#00-kontrol-dokumen-sumber--hierarki-keputusan)
- [01. Ringkasan eksekutif & visi](#01-ringkasan-eksekutif--visi)
- [02. Ruang lingkup, prinsip & batasan](#02-ruang-lingkup-prinsip--batasan)
- [03. Status riil repository & arsitektur target](#03-status-riil-repository--arsitektur-target)
- [04. Katalog modul universal (16 domain)](#04-katalog-modul-universal-16-domain)
- [05. Aktor, role & matriks izin](#05-aktor-role--matriks-izin)
- [06. Identity & Access Security (Google OAuth, Email + WhatsApp)](#06-identity--access-security-google-oauth-email--whatsapp)
- [07. Universal control: kelas aksi, risiko & lifecycle perintah](#07-universal-control-kelas-aksi-risiko--lifecycle-perintah)
- [08. Model akuntansi & definisi uang](#08-model-akuntansi--definisi-uang)
- [09. POS & pembayaran pelanggan](#09-pos--pembayaran-pelanggan)
- [10. Shift: Open Shift, arus kas & Close Shift](#10-shift-open-shift-arus-kas--close-shift)
- [11. QRIS: paid vs settlement](#11-qris-paid-vs-settlement)
- [12. Manager Deposit, Vault & custody](#12-manager-deposit-vault--custody)
- [13. Closing state machine & Owner Final Approval](#13-closing-state-machine--owner-final-approval)
- [14. Risk LV1–LV5, investigasi & keadilan pemeriksaan](#14-risk-lv1lv5-investigasi--keadilan-pemeriksaan)
- [15. Payroll liability & kepatuhan ketenagakerjaan](#15-payroll-liability--kepatuhan-ketenagakerjaan)
- [16. Rekap bulanan & timeline timestamp](#16-rekap-bulanan--timeline-timestamp)
- [17. Produk, harga, resep & HPP](#17-produk-harga-resep--hpp)
- [18. WMS, supplier, Bar/Kitchen & KDS](#18-wms-supplier-barkitchen--kds)
- [19. Member, HR, event, marketing, meja & QR](#19-member-hr-event-marketing-meja--qr)
- [20. Laporan, PDF/Excel, Google Drive & Gmail](#20-laporan-pdfexcel-google-drive--gmail)
- [21. AI: Financial Decision Engine & kualitas jawaban](#21-ai-financial-decision-engine--kualitas-jawaban)
- [22. MCP Gateway & ChatGPT Owner Bridge](#22-mcp-gateway--chatgpt-owner-bridge)
- [23. UI/UX: prinsip, IA & navigasi](#23-uiux-prinsip-ia--navigasi)
- [24. Design system & component library](#24-design-system--component-library)
- [25. Spesifikasi layar per modul & per halaman](#25-spesifikasi-layar-per-modul--per-halaman)
- [26. Data model & API konseptual](#26-data-model--api-konseptual)
- [27. Keamanan, privasi, audit & pemulihan](#27-keamanan-privasi-audit--pemulihan)
- [28. Acceptance criteria terpadu](#28-acceptance-criteria-terpadu)
- [29. Roadmap implementasi & release gates](#29-roadmap-implementasi--release-gates)
- [30. KPI, SLO & monitoring](#30-kpi-slo--monitoring)
- [31. Risk register & keputusan terbuka](#31-risk-register--keputusan-terbuka)
- [32. RACI, Definition of Ready & Done](#32-raci-definition-of-ready--done)
- [33. SOP per peran](#33-sop-per-peran)
- [34. Master prompt implementasi (Claude Code)](#34-master-prompt-implementasi-claude-code)
- [35. Matriks fitur F01–F55 & traceability](#35-matriks-fitur-f01f55--traceability)
- [36. Glosarium & referensi](#36-glosarium--referensi)

---

## 00. Kontrol dokumen, sumber & hierarki keputusan

### 00.1 Dokumen sumber yang digabung

| ID | Dokumen asal | Isi pokok |
|---|---|---|
| **S1** | Garage OS Master PRD AI Command Center + MCP V2.0 (PRD-GOS-MCP-001, 20 hlm.) | 16 domain, universal owner control (CRUD), MCP tool catalog, Owner Control Center, Reports/Drive/Gmail, AC-01–AC-36 |
| **S2** | Garage Tebing Tinggi Master PRD Financial Security, MCP & Identity V3.1 (V3.0 + Addendum V3.1, 72 hlm.) | Kontrol kas & Smart Closing (F01–F40), audit repo, MCP read-only, Google OAuth + verifikasi email & WhatsApp, Owner staff approval |
| **S3** | Garage OS Master PRD UI/UX Transformation V1.0 (PRD-GOS-UX-2026-001, 24 hlm.) | Prinsip UX, IA, design system, screen registry, AC-UX-01–24 |

Dokumen ini **menggantikan** ketiganya sebagai acuan tunggal. S1–S3 tetap dapat dirujuk sebagai lampiran historis.

### 00.2 Hierarki keputusan bila terjadi konflik

1. **Invarian keuangan & identitas (S2)** mengikat untuk semua operasi berisiko — lebih khusus daripada S1 dan S3.
2. **Audit repository riil (S2 Bagian 49–62)** menggantikan asumsi versi lama bila bertentangan.
3. **Cakupan universal & tata kelola MCP (S1)** berlaku untuk semua domain lain yang diizinkan.
4. **Keputusan UX (S3)** adalah usulan yang wajib divalidasi riset pengguna dan persetujuan Owner; tidak boleh menimpa persyaratan S1/S2.

### 00.3 Konflik yang telah diselesaikan dalam dokumen ini

| Topik | S1 | S2 | Keputusan V4.0 |
|---|---|---|---|
| Kewenangan ChatGPT/MCP | Universal CRUD semua modul via preview + approval | Finance read-only; tidak ada tool pemindah uang | **Bertahap.** Peluncuran: read-only seluruh domain. Fase berikutnya: write R1 (non-finansial) dan R2 tertentu (harga, master) via preview → approval terikat digest → konfirmasi di Garage OS. **Tidak pernah via MCP:** Final Closing, mutasi ledger historis, QRIS paid manual, transfer dana, grant role kritis, potong gaji, hapus audit (lihat §22.5). |
| Endpoint MCP | `/api/mcp` universal | `/api/mcp` existing + `/api/mcp/chatgpt` OAuth | Pertahankan `/api/mcp` untuk agent internal sampai hardening; buat route OAuth khusus ChatGPT. Tool `garage_api` wildcard **dihapus** dari eksposur ChatGPT. |
| Skala risiko | R0–R4 (risiko aksi) | LOW–CRITICAL lalu LV1–LV5 (risiko fraud) | Dua skala berbeda dan keduanya dipakai: **R0–R4** untuk aksi/perintah, **LV1–LV5** untuk sinyal anomali (LOW≈LV2, MEDIUM≈LV3, HIGH≈LV4, CRITICAL≈LV5; LV1 = INFO). |
| QR | Event: tanpa check-in QR | PDF: QR verifikasi dokumen opsional | Event tidak mendapat check-in QR kecuali diminta. QR verifikasi dokumen PDF opsional dan bukan QR undangan. |
| Roadmap | 6 fase (Audit → Rollout) | P0–P6 berbasis risiko | Disatukan menjadi Fase 0–7 (§29). |
| Kode fitur | — | F01–F40, master prompt menyebut F01–F55 | F41–F55 ditetapkan di dokumen ini untuk identitas, MCP, dan UX (§35). |

### 00.4 Aturan membaca

- **Wajib/requirement** = target desain & implementasi, bukan klaim terpasang.
- **Teridentifikasi di source** = hasil audit read-only repository (commit `89d4318564f1664f3c2e60c5623cf43be17f7cd7`, branch `main`); server, DB live, dan UX aktual belum diaudit.
- **Usulan** = keputusan desain yang perlu diuji dan disetujui Owner.

---

## 01. Ringkasan eksekutif & visi

Garage OS menjadi **satu platform F&B** yang: operasionalnya cepat dipelajari, catatan uangnya tidak mudah dimanipulasi, keputusan Owner berbasis bukti, dan dapat dikendalikan melalui dashboard, Aya (asisten in-app), maupun ChatGPT — semuanya melalui **satu Owner Command Gateway** dengan aturan yang sama.

> **VISI PRODUK** — Owner cukup berkata: *"Periksa seluruh operasi Garage hari ini, jelaskan masalahnya, ubah data yang saya minta, kirim laporan lewat email, dan simpan arsipnya ke Google Drive."* Sistem mengeksekusi melalui API bisnis, mengembalikan bukti, dan menjaga akuntabilitas.

### 01.1 Hasil yang dituju

| Pilar | Target |
|---|---|
| Universal owner control | READ / CREATE / UPDATE / ARCHIVE / DELETE / APPROVE / EXECUTE pada semua domain yang mendukung — dengan kontrol teknis. |
| Integritas keuangan | Omzet, uang laci, deposit manajer, petty cash, parkir Rp10.000, QRIS clearing dan bank terpisah; tiap sumber punya ledger, bukti, dan penanggung jawab. |
| Audit-ready | Setiap perubahan terikat identitas, alasan, before/after, versi objek, bukti API, waktu. |
| Single source of truth | Garage OS adalah sumber data; ChatGPT bukan database baru. |
| Identitas aman | Member & calon staf memverifikasi **email dan WhatsApp**; staf terkunci sampai Owner menyetujui. |
| Owner-first insight | Dashboard 360, Approval Center per tanggal, Report Studio, evidence drill-down. |
| UX konsisten | Satu design system, task-first, aman untuk kasir, responsif desktop/tablet/mobile. |
| Otomasi tepercaya | Ekspor Drive, email resmi, alert, laporan berkala, rekonsiliasi — tanpa klaim sukses sebelum terverifikasi. |

### 01.2 Struktur kontrol inti

**Kasir menghitung & mengklarifikasi → Manajer memverifikasi → Owner mengesahkan (MFA).** Penanggung jawab ditentukan dari serah terima nyata. Laporan dapat disahkan *dengan exception* tanpa menghapus selisih.

### 01.3 Aturan keputusan produk

Kewenangan Owner paling luas dalam bisnis, tetapi **tidak** berarti akses tanpa kontrol. Tidak ada tool SQL bebas, shell/VPS bebas, penghapusan log, penghilangan jejak keuangan, atau bypass otorisasi. Aksi berdampak tinggi melalui preview, persetujuan spesifik, dan mekanisme pemulihan.

---

## 02. Ruang lingkup, prinsip & batasan

### 02.1 Dalam lingkup

- Seluruh 16 domain Garage OS (§04) + modul hasil discovery (*rule "semua hal"*: modul yang tidak tercantum tetap wajib masuk Module Registry).
- Pencatatan arus uang shift, setoran parkir harian, transfer dana, pengeluaran, petty cash, rekonsiliasi QRIS, manager custody.
- Peringatan Open/Close Shift, double blind recount, verifikasi berlapis, Owner Final Closing + MFA.
- Identitas: Google OAuth, verifikasi email + WhatsApp OTP, pengajuan staf, Owner Access Approval Center.
- MCP Gateway (ChatGPT) dan Aya (in-app via OpenAI API) dengan kebijakan identik.
- Laporan PDF/XLSX/CSV, Google Drive, Gmail, jadwal & alert.
- Redesign UI/UX seluruh layar internal, workspace Owner, portal member, konfigurasi.

### 02.2 Di luar lingkup tanpa instruksi eksplisit Owner

- Migrasi framework, database, sistem auth, atau hosting dari VPS existing.
- Perombakan massal master produk, harga, kategori, resep, transaksi historis/COGS.
- Mengubah rumus pembukuan untuk "menyamakan" saldo.
- Pemotongan gaji otomatis, pelabelan pegawai curang tanpa pemeriksaan, pencatatan uang fiktif.
- MCP wildcard, raw SQL, unrestricted deletion, auto-approve finansial.
- Integrasi penyedia QRIS baru yang belum ditentukan (siapkan adapter + rekonsiliasi manual berbukti).

### 02.3 Prinsip wajib

| # | Prinsip | Makna |
|---|---|---|
| P1 | Balance = sesuai bukti | Selisih tetap tercatat sampai diselesaikan; tidak dipaksa nol. |
| P2 | Owner-only final | Hanya Owner dengan autentikasi kuat yang mengesahkan Final Closing. |
| P3 | Non-destruktif | Jangan menghapus/menimpa fitur atau data yang berfungsi sebelum pemetaan dependensi & backup. |
| P4 | Free pricing, safe history | Owner boleh menetapkan harga apa pun yang valid, tetapi transaksi, cost historis, dan ledger tidak berubah retroaktif. |
| P5 | Tidak mengaku berhasil tanpa bukti | Timeout → `UNKNOWN / PENDING_RECONCILIATION`, bukan sukses otomatis. |
| P6 | Anomali ≠ vonis | Sistem menandai indikasi; keputusan pelanggaran melalui investigasi manusia. |
| P7 | Identitas ≠ izin | Login berhasil tidak sama dengan authorization; role dicek di server setiap request. |
| P8 | Data observasi = data, bukan instruksi | Teks di email, invoice, catatan kasir, deskripsi produk tidak boleh memicu mutasi (prompt injection). |
| P9 | Uang sebagai integer | Rupiah disimpan integer/DECIMAL tepat, tidak pernah floating point. |
| P10 | Stack existing | Pertahankan Next.js/Drizzle/PostgreSQL/Better Auth dan ledger yang sudah ada; jangan menduplikasi. |

### 02.4 Parameter konfigurasi (tidak boleh di-hardcode)

| Parameter | Default rancangan | Wewenang |
|---|---|---|
| Nama outlet | GARAGE TEBING TINGGI | Owner |
| Brand | Garage Coffee | Tetap |
| Setoran tambahan harian | Rp10.000 — label diusulkan "Setoran Parkir Harian" | Owner memastikan jenis & kewajiban |
| Tanggal efektif kebijakan kasir | Belum ditentukan (`effective_date`) | Owner |
| Cash float minimal | Mengikuti SOP existing | Owner |
| Jadwal mid-shift reminder | Konfigurabel | Owner/Manajer |
| Batas approval pengeluaran | Konfigurabel | Owner |
| Toleransi selisih & aturan hitung ketiga | Konfigurabel | Owner |
| Cut-off business date | Per outlet | Owner |
| Ambang data freshness | Konfigurabel | Owner/Ops |

---

## 03. Status riil repository & arsitektur target

### 03.1 Temuan audit read-only (source, bukan production)

| Bukti source | Yang ditemukan | Konsekuensi |
|---|---|---|
| `package.json` | Next.js 16.4.3, TS, React 19, Drizzle, pg, Better Auth, Vitest, PDFKit, ExcelJS | **Pertahankan stack.** Jangan migrasi ke auth lain. |
| `src/lib/auth.ts` | Better Auth + `twoFactor({ issuer: "Garage Coffee" })`, login-attempt hooks; email/password staf | Gunakan step-up TOTP existing; tambah Google provider & email verification; audit lockout per route. |
| `src/lib/member-auth.ts` | Cookie & token member tersendiri; registrasi: nama, WA, email opsional, password | Bangun federasi Google terisolasi dari staff roles; email + WA wajib untuk registrasi baru. |
| `src/lib/cash-ledger.ts` | Ledger sumber→tujuan, idempotency, cache expectedCash, reversal; akun drawer, petty, qris_clearing, deposit_transit, bank, external | **Reuse** buku kas tunggal; jangan membuat ledger kedua. |
| `src/lib/reports/reconciliation.ts` | Laporan shift: cash, QRIS, deposit, float, shortage, jam, nama kasir | Perkuat agregat harian/bulanan & bukti per transaksi. |
| `src/app/api/finance/cash-sessions/[id]/close/route.ts` | PATCH menerima actualCash, denominations, managerSignOff/PIN, QRIS, floatLeft → `closeCashSession` | **Pisahkan** SUBMIT_FOR_REVIEW vs OWNER_FINAL_APPROVE; audit authorization server. |
| `src/app/api/finance/cash-sessions/[id]/report/route.ts` | PDF shift; nama file `shift-{code}.pdf` | Sesuaikan penamaan tanggal, versi approved, info Owner. |
| `src/app/api/mcp/route.ts` | MCP Streamable HTTP JSON-RPC; POST, GET 405 | Jangan buat MCP baru; butuh OAuth kompatibel ChatGPT & kontrol tool. |
| `src/lib/agent-tools.ts` | Tool baca/ubah + `garage_api` generik; bearer `gk_agent_` | Least privilege; hapus eksposur endpoint finance arbitrer ke LLM. |
| `docs/AGENT-API.md` | Agent key read-only tidak bisa MCP | Dukung MCP read-only; token terpisah. |
| Integration tests | cash-ledger, garage-cash-drawer, agent-api-key, cash-oversight, closing-audit-probe | Tambah contract test MCP ChatGPT, Owner Final Approval, mismatch, identitas. |
| Staff approval | Alur onboarding Google + Owner approval belum ditemukan lengkap | Bangun `staff_access_requests` + gate server-side. |

> Modul nyata untuk cash ledger, MCP, 2FA, dan laporan **ada di source**. Belum terverifikasi bahwa endpoint production aman, perhitungan benar, migrasi terpasang. **Dilarang menyebutnya 100% aman.**

**Verifikasi lanjutan yang masih terbuka:** deployment VPS (env tersensor, nginx/reverse proxy, HTTPS, origin/trust, backup/restore, cron, proses Node, integritas migrasi); hasil test pada staging; `cashSessions.status` & endpoint close/approve end-to-end; manager vs owner permission termasuk Agent API; inventaris saldo riil (drawer, float, deposit transit, petty, bank, provider); outlet boundary pada setiap service/route/export/tool; timezone WIB.

### 03.2 Arsitektur target — modular monolith

```
ChatGPT (custom remote MCP) ─┐
Aya (in-app, OpenAI API) ────┼─► HTTPS + OAuth/OIDC ─► Garage OS MCP Gateway
Dashboard Owner/Staff UI ────┘                              │
                                                   AuthZ / Policy Engine
                                                            │
                                           Command Router / Approval Service
                                                            │
                                         Existing Garage OS Domain Services
                       (POS · Shift · Cash Ledger · Payments · WMS · HR · CRM · …)
                                                            │
                        PostgreSQL (transaksi) + immutable audit + outbox
                                                            │
                         Job Queue ─► PDF/Report · Drive · Gmail · WhatsApp · Email
                     Observability + Secret Vault (sisi VPS)
```

**Aliran keuangan:** transaksi masuk ke layanan Garage OS → financial service merekam journal immutable/idempotent dalam transaksi atomik → reconciliation service menghitung expected/actual/tender/settlement/custody/exception → approval service membentuk snapshot berversi → read-only reporting API → MCP Gateway hanya memanggil API ini → ChatGPT menjelaskan; keputusan final tetap di Garage OS.

### 03.3 Sumber kebenaran

| Objek | Sumber berwenang |
|---|---|
| Cash ledger | `cash_ledger_entries` — masuk/keluar laci nyata; reversal immutable |
| Payments | payments / payment attempts — status provider, receipt, refund; tidak pernah dari tombol UI |
| Custody | cash transfers & manager deposit — tiap pemegang uang jelas |
| Counting | snapshot hitung pecahan — count #1 dan #2 independen |
| Reports | snapshot + evidence refs, bukan perhitungan ulang bebas oleh AI |
| AI | read-only default; output analisis, bukan posting |

### 03.4 Kontrol anti-celah arsitektural

- **Point-in-time consistency:** final closing dihitung pada ledger sequence/version yang sama.
- **Idempotency end-to-end:** checkout, cash movement, report job, rekonsiliasi, deposit, approval.
- **Outbox:** event finansial & permintaan laporan diposting dalam transaksi yang sama; worker retry aman.
- **Reversal, bukan delete:** koreksi = entri penyeimbang + reason, actor, approval, timestamp.
- **Segregation of duties:** pembuat Cash Out ≠ satu-satunya pemeriksa di atas threshold; dual attestation custody.
- **Offline fail-closed:** tanpa konektivitas tidak ada label QRIS PAID; tampilkan pending queue.
- **Business-day cut-off:** shift lintas tengah malam mengikuti business_date outlet; beku setelah final.
- **Tenant/outlet boundary** & row/field permission di server setiap request, bukan dari UI/prompt.
- Gateway **tidak** memakai service-role DB langsung untuk operasi bisnis lintas modul.
- Query AI memakai semantic mapping ke metrik tervalidasi; **tidak** mengeksekusi SQL buatan teks AI.

### 03.5 Open-source: adopsi selektif

| Repository | Keputusan |
|---|---|
| better-auth/better-auth | USE EXISTING — audit step-up & OAuth bridge; tidak ada auth paralel |
| modelcontextprotocol/typescript-sdk | ADOPT SELECTIVELY — bandingkan dengan handler custom |
| modelcontextprotocol/inspector | DEV TOOL untuk CI, bukan data production |
| OWASP/ASVS 5.0 | BASELINE checklist keamanan |
| openfga/openfga | REFERENCE — hanya bila RBAC existing tidak cukup |
| graphile/worker | PILOT bila job existing belum andal (PDF, alert, retry) |
| open-telemetry/opentelemetry-js | PILOT tracing + correlation ID dengan redaksi |
| pgaudit/pgaudit | OPTIONAL bila PostgreSQL VPS mendukung |
| formancehq/ledger | STUDY PATTERN, bukan migrasi |
| tigerbeetle/tigerbeetle | NOT NOW — dual source of truth tidak proporsional |
| temporalio/sdk-typescript | DEFER — state machine PostgreSQL cukup |

---

## 04. Katalog modul universal (16 domain)

| # | Domain | Contoh data & tindakan owner | Prioritas |
|---|---|---|---|
| 01 | Dashboard & Analytics | Omzet, biaya, tren, margin, KPI, alasan anomali, drill-down, laporan ad hoc | P0 |
| 02 | POS & Order | Order meja/QR, quick retail, checkout, invoice, diskon, refund, void, histori | P0 |
| 03 | Shift & Cash | Open/close, float, cash count, parkir, petty, QRIS, discrepancy, approval | P0 |
| 04 | Keuangan & Ledger | Uang masuk/keluar, akun, kategori, cash flow, rekonsiliasi, penyesuaian | P0 |
| 05 | Produk & Harga | Produk/varian/kategori, harga jual, scope outlet/channel/event, addons | P0 |
| 06 | Bahan & Resep | Material, unit, BOM, HPP estimasi, harga supplier, versi | P0 |
| 07 | Gudang / WMS | Stok, opname, min-max, transfer, waste, permintaan divisi, PO, receiving | P0 |
| 08 | Bar / Kitchen / KDS | Status ticket, waktu produksi, batch, stock-out, PIC | P1 |
| 09 | Member & CRM | Profil, tier Silver/Gold/Platinum, poin, benefit, consent | P1 |
| 10 | Karyawan / HR | Akun, role, approval pendaftaran, jadwal, absensi, payroll terproteksi | P1 |
| 11 | Event & Invitation | Event, harga event, landing, undangan, link personal, RSVP | P1 |
| 12 | Konten & Marketing | Konten website, banner, promosi, jadwal, katalog digital | P1 |
| 13 | Meja & QR Ordering | Peta meja, QR order pelanggan, status meja, kirim ke KDS | P1 |
| 14 | Dokumen & Files | Generate PDF/XLSX/CSV, metadata, Drive sync, retensi | P0 |
| 15 | Email & Notifikasi | Laporan rutin, inbox berizin, draf, OTP, alarm | P1 |
| 16 | Config, Security & Ops | Outlet, parameter, role, konektor, job, health, release, audit | P0 |

### 04.1 Extensible Module Registry

Setiap modul (termasuk yang baru) mendaftarkan: `resource schema`, `allowed actions`, `relationships`, `authorizer`, `validator`, `risk tier`, `preview builder`, `executor`, `audit descriptor`, `recovery strategy`, `reporting adapter`. Owner Control Center menampilkan daftar kemampuan dan *missing capabilities*. Registrasi melalui proses domain + izin, **bukan** akses database mentah.

---

## 05. Aktor, role & matriks izin

### 05.1 Aktor & batas otorisasi

| Aktor | Baca | Ubah / eksekusi | Persetujuan |
|---|---|---|---|
| Owner terverifikasi | Seluruh data bisnis (dengan pembatasan privasi relevan) | CRUD seluruh modul sesuai invarian & kebijakan risiko | Final untuk R2/R3; step-up MFA untuk kritis |
| Manager | Scope outlet/modul terdelegasi | CRUD terbatas per permission; terima & hitung deposit | Hanya sesuai delegasi; **tidak** Final Closing |
| Finance reviewer | Ledger, rekonsiliasi, laporan sesuai izin | Review, catatan, roll-forward kasus | Rekomendasi |
| Kasir | POS & shift miliknya | Order, payment, open/submit closing, cash in/out terbatas | Tidak dapat ubah master/log/role/final |
| Waiter | Meja & status order | Bantu order | — |
| Bar/Kitchen | KDS, stok & produksi divisi | Update ticket, request stok | Tidak ubah harga/ledger |
| Gudang | WMS, supplier, purchasing | Opname, PO, receiving | Approval anggaran bila diizinkan |
| Member | Data akun/poin miliknya | Profil, pesanan, RSVP | Tidak dapat memanggil MCP owner |
| Calon staf (pending) | Status pengajuan | Koreksi data pengajuan terbatas | Tidak ada akses operasional |
| AI / service account | Sesuai scope delegated user | Hanya tool yang diizinkan | **Tidak pernah** menyetujui tindakannya sendiri |

### 05.2 Matriks aktivitas keuangan

| Aktivitas | Kasir | Manajer | Owner |
|---|---|---|---|
| Open Shift & input hitungan | Ya, sendiri | Pantau | Pantau |
| Cash-out sesuai limit | Ajukan/terbatas | Review/approve | Semua sesuai kebijakan |
| Terima deposit | Tidak | Ya, terverifikasi | Audit |
| Submit pre-closing | Ya | Pantau | Pantau |
| Verifikasi shift | Klarifikasi | Ya | Ya |
| **Final Closing** | **Tidak** | **Tidak** | **Ya + MFA fresh** |
| Tutup kasus / liability | Tidak | Rekomendasi (bukan kasus dirinya) | Keputusan berbukti |
| Ubah role/policy | Tidak | Tidak | Ya + step-up |
| Approve pendaftar staf | Tidak | Tidak (403) | Ya + MFA |

---

## 06. Identity & Access Security (Google OAuth, Email + WhatsApp)

> **KEPUTUSAN BISNIS WAJIB:** Member dan calon karyawan harus memverifikasi **KEDUA** identitas: email terdaftar **dan** nomor WhatsApp terdaftar. Google Sign-In hanya metode identifikasi awal. Untuk karyawan, akses kerja terkunci sampai disetujui Owner.

### 06.1 Prinsip identitas

- Satu identitas Google dapat memiliki dua persona (member & staff); hak keduanya **tidak** saling diwariskan.
- Jangan gabungkan akun lama hanya karena email sama; account linking harus disetujui dengan verifikasi kepemilikan.
- Gunakan **provider subject ID** stabil sebagai kunci, bukan email.
- Meskipun Google menyatakan email verified, Garage OS tetap mengirim challenge (link/OTP) ke email terdaftar; `email_verified_at` diisi hanya setelah challenge Garage OS berhasil.
- Login Google **tidak pernah** otomatis memberi role Owner/Manager/Kasir. Akun Google dengan email mirip Owner/staf tidak boleh memperoleh role via auto-provision, auto-link, atau claim dari browser.
- Akun ChatGPT bukan bukti seseorang adalah Owner.

### 06.2 Kebijakan verifikasi ganda

| Aktor | Verifikasi email | Verifikasi WhatsApp | Akses setelah lolos |
|---|---|---|---|
| Member baru | Wajib (link/OTP ke email terdaftar) | OTP ke nomor E.164 | Portal member, poin, level, histori — tanpa POS internal |
| Calon karyawan | Wajib | Wajib | Hanya halaman STATUS PENGAJUAN |
| Karyawan disetujui | Tetap; ulang jika ganti email | Tetap; ulang jika ganti nomor | Sesuai role, outlet, MFA aksi sensitif |
| Owner | Role sah existing | — | MFA/TOTP wajib untuk aksi sensitif |

`email_verified_at` dan `whatsapp_verified_at` disimpan terpisah; `identity_verified = true` hanya jika keduanya valid untuk kontak aktif pada `contact_version` tersebut.

> Email terverifikasi ≠ WhatsApp dimiliki. WhatsApp OTP ≠ seseorang adalah karyawan. Owner approval ≠ pengganti verifikasi kontak.

### 06.3 State machine identitas & pengajuan staf

```
DRAFT → PENDING_EMAIL → PENDING_WHATSAPP → IDENTITY_VERIFIED
      → (staf) PENDING_OWNER_APPROVAL → APPROVED | REJECTED
      → ACTIVE_STAFF | SUSPENDED | REVOKED
      → (member) ACTIVE_MEMBER
```

Tidak boleh melompat status kecuali jalur migrasi resmi yang diaudit. `REJECTED`, `SUSPENDED`, `REVOKED` selalu mencatat alasan, waktu, aktor.

### 06.4 Alur member baru via Google

1. Buka `/member-login` → **DAFTAR DENGAN GOOGLE**.
2. OAuth redirect; server memvalidasi state, PKCE, audience, nonce/issuer, token.
3. Ambil nama & email; kirim verifikasi ke email terdaftar; tunggu klik link aman / input OTP.
4. Isi WhatsApp format +62; kirim OTP via WhatsApp Business Platform resmi.
5. Backend memverifikasi challenge (bukan nilai frontend).
6. Cari/tautkan CRM customer & `member_accounts` dengan aman; cegah profil ganda & tabrakan nomor.
7. Aktifkan hanya jika `email_verified && whatsapp_verified`.
8. Redirect `/member`; audit + sumber OAuth.

**Member lama:** password/login lama tidak dihapus; wajib melengkapi email & WA terverifikasi sejak tanggal kebijakan. Jika email dulu opsional, minta email lebih dulu; jangan buat user kedua untuk nomor sama; jangan merge akun yang punya saldo poin/histori tanpa review konflik. Perubahan WA/email diverifikasi pada kontak baru sebelum menggantikan kontak aktif; notifikasi ke kontak lama.

**UI member:** progress 4 tahap — *Akun Google/Email → Verifikasi Email → Verifikasi WhatsApp → Akun Aktif*; status Garage OS ditampilkan terpisah dari status Google; tombol kirim ulang dibatasi.

### 06.5 Alur calon karyawan

1. `/staff/register` → **DAFTAR DENGAN GOOGLE**.
2. OAuth + verifikasi email.
3. WhatsApp +62 + OTP.
4. Profil lamaran: nama legal, posisi diajukan, outlet, catatan/nomor staf bila ada.
5. Buat `staff_access_request` status `PENDING_OWNER_APPROVAL` — **tidak** membuat `staff_profiles` aktif/role.
6. Owner menerima notifikasi (identitas, kontak terverifikasi, tanggal, jejak audit).
7. Owner: **APPROVE / REJECT / REQUEST INFO**; sebelum approve wajib tentukan jabatan, outlet, batas permission.
8. Konfirmasi dengan akun Owner + step-up MFA.
9. Buat/tautkan staff profile & permissions secara atomik; notifikasi email/WA.

| Status pemohon | Diizinkan | Dilarang |
|---|---|---|
| Email/WA belum lengkap | Verifikasi kontak, bantuan, lihat status | POS, shift, finance, stok, WMS, payroll, file staf |
| Keduanya verified, pending | Lihat status, koreksi data terbatas | Semua endpoint staf |
| Rejected/Suspended | Lihat status, banding | Login operasional, data internal |
| Approved | Sesuai role, outlet, MFA, shift aktif | Apa pun di luar izin role |

### 06.6 Owner Access Approval Center

- Daftar pengajuan dengan filter status, tanggal/jam, outlet, email, nomor WA, jabatan diminta.
- Kartu identitas: nama, email + status, WA tersamarkan + status, Google subject internal, waktu submit. **Tidak** menampilkan OTP/token.
- Role hanya dari allowlist: Kasir, Bar, Kitchen, Waiter, Gudang, Manager, Finance, atau role sistem sah.
- Outlet ditentukan Owner, bukan dari input calon.
- Alasan terstruktur untuk approve/reject; step-up MFA untuk role istimewa.
- Perubahan role/outlet/permission setelah aktif = approval terpisah.
- Revoke berlaku segera; invalidasi sesi.
- Untuk jabatan berisiko, Owner melakukan verifikasi tambahan secara operasional.
- Approval staf ≠ approval closing. Hanya staf aktif sesuai role yang boleh membuka shift.

### 06.7 Keamanan email & WhatsApp OTP

**Email:** layanan transaksional domain bisnis dengan SPF/DKIM/DMARC; link single-use TTL singkat (mis. 20 menit) atau OTP; email tidak dipakai mengirim password awal; token tidak masuk log/analytics/redirect tidak tepercaya; notifikasi keamanan saat ganti email/linking/aktivitas mencurigakan.

**WhatsApp:**
- WhatsApp Business Platform/penyedia resmi dengan template autentikasi disetujui; perhitungkan biaya.
- Normalisasi E.164 (+62…).
- OTP 6 digit dari generator kriptografis; TTL 5 menit; maks 5 percobaan/challenge; cooldown kirim ulang ≥ 60 detik; rate limit per nomor/IP/perangkat; batas harian; monitoring biaya.
- Simpan **hash** OTP; challenge diikat user, nomor, tujuan, `contact_version`, expiry.
- Dilarang: WA manual, tautan chat biasa, screenshot sebagai bukti.
- Template: *"Kode verifikasi Garage Coffee: [OTP]. Berlaku 5 menit. Jangan berikan kode kepada siapa pun."*

**Gagal/penyalahgunaan:** OTP kedaluwarsa → challenge lama dibatalkan; nomor dipakai akun lain → alur review konflik tanpa membuka data pemilik; email Google cocok dengan akun berbeda → jangan auto-promote/merge data finansial/poin.

### 06.8 Tiga konsep yang tidak boleh dicampur

| Fitur | Definisi | Kontrol |
|---|---|---|
| Continue with Google | Google membuktikan identitas login | Better Auth socialProviders; tetap wajib email + WA |
| Sign in with ChatGPT | Login via akun ChatGPT pada aplikasi mitra | Ketersediaan terbatas; bukan syarat akses |
| Garage OS MCP | Konektor AI membaca/menindak data atas izin akun terkait | OAuth terpisah, scope, read-only default |

### 06.9 Feature flag (kandidat nama)

`member_google_auth_enabled`, `staff_google_apply_enabled`, `dual_contact_verification_required`, `staff_owner_approval_required`.

---

## 07. Universal control: kelas aksi, risiko & lifecycle perintah

### 07.1 Kelas aksi

| Kelas | Perilaku minimum | Contoh |
|---|---|---|
| READ / SEARCH | Filter periode/outlet, pagination, referensi data & timestamp | "Cari semua transaksi QRIS kemarin." |
| ANALYZE | Metrik terdefinisi, evidence IDs, hipotesis diberi label | "Cari penyebab selisih shift." |
| CREATE | Validasi required, duplikasi, policy, receipt | "Tambah supplier dan bahan baru." |
| UPDATE | Patch field tertentu, compare-and-swap/version, preview diff | "Ubah harga jual produk A." |
| BULK UPDATE | Target eksplisit, batas batch, sample + full impact, approval digest | "Update 60 produk event." |
| ARCHIVE / DISABLE | Nonaktif operasional, riwayat tetap ada | "Sembunyikan menu yang tidak dijual." |
| DELETE | Hard delete hanya data eligible; dependency & retention check | "Hapus draf laporan yang salah." |
| APPROVE / EXECUTE | Jalankan workflow bisnis, bukan injeksi status | "Setujui PO dan kirim email." |
| IMPORT / EXPORT | Dry-run, mapping, checksum, status per baris | "Import daftar supplier CSV." |
| SCHEDULE | Tugas laporan/alert/rekonsiliasi + execution history | "Kirim ringkasan setiap malam." |

### 07.2 Klasifikasi risiko aksi (R0–R4)

| Tingkat | Jenis | Aturan |
|---|---|---|
| R0 — Baca | Query rutin, laporan non-sensitif | Tanpa approval per query; wajib authorization |
| R1 — Reversibel | Draf, konten, catatan non-keuangan | Validasi + receipt; konfirmasi kontekstual |
| R2 — Dampak finansial | Harga, refund, inventory adjustment, payroll, poin member | Preview, reason, konfirmasi eksplisit |
| R3 — Kritis/massal | Bulk price, delete berelasi, role/permission, transfer status, Final Closing | Step-up MFA + approval terikat digest + backup/rollback plan |
| R4 — Tidak diizinkan | Hapus ledger/audit, akses token rahasia, SQL bebas, bypass policy | **Tolak**; tawarkan prosedur koreksi sah |

### 07.3 Definisi penghapusan aman

Delete = draft delete, archive, disable, atau hard delete — ditentukan retensi, referensi transaksi, dan legal requirement. Owner boleh mengajukan semuanya, tetapi sistem **menolak** hard delete yang merusak invoice, ledger, stok, payroll final, dan bukti audit; sediakan reversal/adjustment/arsip sebagai gantinya.

### 07.4 Lifecycle satu perintah (UI, Aya, atau ChatGPT)

1. **Authenticate** — validasi sesi/OAuth; pemetaan user ke Owner terverifikasi.
2. **Parse intent** — aksi, objek, outlet, periode, tipe mutasi, batasan.
3. **Resolve entities** — ID nyata; tampilkan ambiguitas SKU/akun/shift.
4. **Authorize** — policy level resource, field, outlet, action, risk score.
5. **Dry-run / preview** — target, diff, dependency, margin/HPP, laporan terdampak, konflik.
6. **Approve** — R2/R3: konfirmasi/step-up; simpan digest + expiry + intended actor.
7. **Execute** — idempotency key + optimistic lock + transaksi ACID atau saga terkontrol.
8. **Verify** — readback keadaan akhir; cek job & sinkronisasi cache.
9. **Audit & notify** — append-only event, receipt, hasil per item, tautan dokumen.
10. **Respond** — keberhasilan nyata, kegagalan sebagian, alasan, langkah pemulihan.

> Jika eksekusi timeout → `UNKNOWN / PENDING_RECONCILIATION`, tidak otomatis sukses dan tidak otomatis diulang tanpa idempotency check.

### 07.5 Operation receipt

`operation_id, request_id, actor_id, source (dashboard|aya|chatgpt), domain, action, scope, target_ids, diff_hash, approved_by, approved_at, status, changed_count, failed_count, executed_at, audit_event_ids, recovery_ref, export_urls`

---

## 08. Model akuntansi & definisi uang

### 08.1 Ledger/saldo yang tidak boleh tercampur

| Objek | Definisi | Dilarang |
|---|---|---|
| Penjualan/omzet | Transaksi jual: gross, diskon, refund, net | Menyamakan omzet dengan uang laci |
| Laci kasir (CASHIER_DRAWER) | Float + uang fisik dalam penguasaan kasir | Menghitung QRIS sebagai cash |
| Penerimaan tambahan (parkir) | Uang non-penjualan yang benar-benar diterima | Menambah pendapatan POS fiktif |
| Deposit/custody manajer (MANAGER_CUSTODY) | Perpindahan kuasa uang tunai dari kasir | Memperlakukan transfer sebagai beban |
| Petty cash (PETTY_CASH_BOX) | Dana operasional, PIC & lokasi jelas | Mengurangi laci bila dibayar dari kas terpisah |
| QRIS clearing | Pembayaran verified, menunggu settlement | Menganggap pending sebagai shortage |
| Bank (BANK_ACCOUNT) / in transit | Setoran & settlement | Mencampur dengan laci |
| Owner/eksternal (OWNER_EXTERNAL) | Transfer langsung Owner ke vendor | Mencatat sebagai Cash Out laci |
| Pembelian stok | Persediaan diterima vs pembayaran | Membuat order take away dummy |

### 08.2 Rumus utama

**EXPECTED CASH (laci)**
```
expected_cash = opening_float
              + cash_sales_received
              + cash_in_non_sales (sah, masuk laci; termasuk parkir bila diterima kasir)
              − cash_refund (sah)
              − cash_out_from_drawer (belanja/expense)
              − transfers_to_manager_or_bank
              − drawer_to_petty_transfers
              + cash_adjustment_approved
```
Parkir dihitung **tepat sekali**. QRIS dan transfer langsung Owner **tidak** masuk.

**CASH DIFFERENCE** = `actual_cash (total hitung pecahan) − expected_cash`. Negatif = KURANG; positif = LEBIH; nol = sesuai untuk komponen kas (balance keseluruhan tetap memerlukan verifikasi transaksi terkait).

**EXPECTED MANAGER CASH** = `opening_custody + accepted_from_cashier − to_bank − back_to_cashier − verified_other_movements`. **MANAGER VARIANCE** = `actual_manager_count − expected_manager_cash`.

**QRIS:** QRIS PAID bukan dana fisik. Gateway paid harus cocok dengan payment refs; pending settlement adalah piutang clearing; MDR, refund, dispute dipisah; split payment punya posting per metode tanpa duplikasi.

### 08.3 Peta posting kejadian

| Peristiwa | Posting laci? | Posting lain / bukti |
|---|---|---|
| Customer bayar CASH | YA: sales cash-in | Receipt, tender, kasir, waktu |
| Customer bayar QRIS | TIDAK | Payment QRIS PAID provider; clearing/settlement |
| Parkir Rp10.000 diterima kasir | YA: cash-in saat benar-benar diterima | Parking status, aktor, waktu, asal uang |
| Parkir diterima manajer langsung | TIDAK | Cash-in manager custody |
| Parkir belum disetor | TIDAK | Outstanding declaration |
| Belanja bahan dari uang laci | YA: cash-out | Expense/purchase, nota, approval, receiving WMS |
| Belanja via transfer Owner langsung | TIDAK | Ledger Owner/eksternal; label "non-drawer" bila ditampilkan |
| Owner menitipkan uang fisik ke kasir | YA: cash-in setelah diterima | Handover |
| Kasir serah deposit ke manajer | YA: transfer out | Transfer in custody; dual count/sign-off |
| Manajer setor bank | TIDAK dari laci | Custody ↓ → deposit transit → bank confirmed |
| Refund tunai sah | YA: cash-out | Order asal + approval |
| Koreksi pembukuan | Jurnal penyesuaian | Tertaut sumber; histori tidak ditimpa |

### 08.4 Ledger keuangan owner

- Owner dapat mengelola kategori akun, pusat biaya, metode pembayaran, aturan approval, budget, jadwal rekonsiliasi, pemetaan transaksi.
- Laporan wajib: P&L manajemen, kas masuk/keluar, petty cash, penjualan per metode, pengeluaran per divisi, refund/void, margin, ketidaksesuaian.
- Transaksi posted dikoreksi via **reversal/adjustment berpasangan**; tidak menulis ulang angka historis.
- Perubahan master harga tidak mengubah nominal transaksi penjualan sebelumnya.

---

## 09. POS & pembayaran pelanggan

### 09.1 Standard checkout (POS-01/02)

1. Cari/scan SKU, varian/add-on, kuantitas.
2. Tinjau cart, diskon, pajak/biaya; total akhir dibekukan.
3. Pilih metode **eksplisit**: CASH / QRIS / transfer / split (bila didukung server) — tile besar dengan warna, ikon, uraian berbeda.
4. **CASH:** input uang diterima → kembalian → konfirmasi *"Pelanggan memberikan uang tunai Rp… dan kembalian Rp…?"*
5. **QRIS:** instruksi bayar; simpan `payment_reference`; status **PENDING** sampai provider/sumber merchant sah memverifikasi. *"Pastikan status BERHASIL dari sumber pembayaran; screenshot pelanggan saja tidak cukup."*
6. Commit atomik sekali (idempotency key) + receipt + actor_id; tampilkan status dari backend.
7. Koreksi metode setelah paid → reversal/refund/change-of-tender terkontrol, alasan, approval, audit.

### 09.2 Tender guard

| Kondisi | Aksi sistem |
|---|---|
| Pilih CASH, pelanggan ingin QRIS (belum paid) | Konfirmasi perubahan; tidak ada entri cash bila uang belum diterima |
| Pilih QRIS, pelanggan menyerahkan cash | Batalkan/migrasikan intent belum paid; cash dihitung nyata |
| QRIS PENDING | Tidak boleh ditandai PAID dari tombol kasir; tidak masuk laci |
| QRIS FAILED | Tidak selesai sebagai paid; tawarkan metode ulang |
| Salah klik setelah PAID | Jejak koreksi terotorisasi; transaksi asal tetap |
| QRIS bayar ganda / webhook berulang | Deteksi referensi/intent; tidak menggandakan omzet |
| Split tidak seimbang | Larang finalisasi; tampilkan kurang/lebih per tender |
| CASH total besar tanpa input uang diterima | Validasi mencegah finalisasi |
| Network putus saat bayar | Status final dari backend; tidak ada posting ganda |

Metode pembayaran bersifat finansial: server-side payment state machine, idempotency, verifikasi signature webhook bila tersedia, audit perubahan metode.

### 09.3 Quick Retail Sale (POS-05)

Kanal **QUICK RETAIL SALE / PENJUALAN LANGSUNG** untuk produk kemasan (cookies, air mineral) tanpa memilih meja dan tanpa label takeaway:
1. POS → QUICK RETAIL SALE.
2. Cari/scan SKU aktif; harga dari master resmi.
3. Validasi stok, pajak, diskon yang diizinkan, aturan barang terbatas (server-side).
4. Bayar CASH/QRIS dengan tender guard.
5. Setelah paid/verified: struk, omzet sekali, stok berkurang, audit actor/shift.
6. Refund/void via approval, tanpa hapus histori.

**SKU baru:** pengelola berwenang menambah SKU (kode, nama, unit, kategori, harga, HPP, stok awal, status, `sales_channel = QUICK_RETAIL`) dengan dedup SKU/barcode, cek produk serupa, validasi harga, jejak approval. Produk existing tidak berubah tanpa persetujuan Owner. Alur meja reguler tidak terpengaruh.

> **QUICK RETAIL SALE:** pelanggan membeli → omzet POS, stok berkurang.
> **QUICK STOCK PURCHASE:** Garage membeli → bukan omzet; stok masuk setelah diterima; Cash Out hanya bila uang laci benar-benar keluar.

### 09.4 Refund & void

Tampilkan order asli, reason, approval, reversal; verifikasi status provider sebelum pembalikan QRIS; transaksi final tidak dihapus (`linked_original_transaction`).

---

## 10. Shift: Open Shift, arus kas & Close Shift

### 10.1 Open Shift wizard (SHF-01)

1. Login kasir (`user_id` dari autentikasi; nama bebas tidak diterima). Hanya staf `ACTIVE_STAFF` dengan role sah.
2. Cek tanggal efektif & versi kebijakan.
3. Tampilkan peringatan wajib (modal besar, overlay gelap, aksen merah; tidak bisa ditutup klik overlay/Escape, tetapi ada jalan kembali/eskalasi manajer).
4. Hitung opening float per pecahan.
5. Checklist terpisah: (1) modal awal dihitung, (2) memahami beda CASH/QRIS, (3) memahami aturan Cash In/Out, (4) kewajiban laporan uang parkir, (5) larangan nilai fiktif.
6. Tombol **BATAL** / **SAYA MEMAHAMI — BUKA SHIFT** (aktif setelah hitung & checklist lengkap).
7. Simpan acceptance log: id kasir, shift, versi teks, timestamp WIB/UTC, device/session. Muncul sekali per pembukaan shift (refresh tidak mengulang). Kebijakan tidak berlaku surut.
8. Header POS menampilkan kasir penanggung jawab sepanjang shift.

Perubahan modal setelah pembukaan = movement, bukan silent overwrite. Penolakan membaca diarahkan ke supervisor; checkbox **bukan** persetujuan potong gaji.

**Teks peringatan Open Shift:**

> **PERINGATAN KERAS — TANGGUNG JAWAB KEUANGAN KASIR GARAGE TEBING TINGGI.**
> Anda bertanggung jawab atas uang dan transaksi dalam pengelolaan Anda selama shift. Catat setiap transaksi sesuai pembayaran nyata: jangan pilih CASH jika pelanggan membayar QRIS, dan jangan pilih QRIS jika pelanggan menyerahkan uang tunai. Jika mengambil uang laci untuk belanja, buat CASH OUT saat uang diserahkan dan lampirkan bukti. Setoran parkir harian Rp10.000 wajib diperiksa dan dilaporkan saat penutupan; jangan mengaku diterima bila uang belum ada. Hitung modal awal hingga pecahan. Jangan memakai uang kas untuk kepentingan pribadi atau memasukkan angka palsu agar laporan terlihat balance. Seluruh aktivitas keuangan diaudit. Setiap selisih wajib dijelaskan dan diperiksa; penggantian kerugian hanya dapat diproses bila terbukti dan sesuai aturan hukum.

### 10.2 Smart Cash Counting

Form touch-friendly: jumlah lembar/koin, subtotal otomatis, recount, riwayat, perbandingan dengan saldo sistem (setelah blind count).

| Pecahan | Input | Perhitungan |
|---|---|---|
| Rp100.000; Rp50.000; Rp20.000 | Jumlah lembar | jumlah × pecahan |
| Rp10.000; Rp5.000; Rp2.000; Rp1.000 | Jumlah lembar | jumlah × pecahan |
| Rp500; Rp200; Rp100 | Jumlah koin | jumlah × pecahan |
| **TOTAL** | Otomatis | Actual Drawer Cash |

Hasil dari pecahan menjadi sumber perhitungan bila berbeda dengan input total.

### 10.3 Tahapan balancing & checkpoint

| Kapan | Guard | Bukti |
|---|---|---|
| OPEN SHIFT | Opening float + konfirmasi kebijakan | Opening count, policy acceptance |
| Setiap pembayaran | Tender guard CASH/QRIS | Payment state, receipt, provider ref |
| Setiap uang keluar | Wajib Cash Out + keterangan | Expense + cash movement |
| MID SHIFT | Review pending/mismatch, expense tanpa bukti | Checkpoint + open exceptions |
| PRE-CLOSE | Status parkir, transfer, pengeluaran, void/refund | Pre-close checklist |
| CLOSE SHIFT | Blind count #1 + recount #2 | Count 1, 2, timestamp, variance |
| MANAGER HANDOVER | Manajer hitung uang diterima & sisa pecahan | Dual acknowledgment |
| OWNER APPROVAL | Sahkan snapshot/exception dengan MFA | Immutable approved report |

> **ATURAN STOP:** Jika ada selisih, jangan blokir pencatatan faktual. Izinkan submit dengan klarifikasi dan status exception; jangan memberi status BALANCED agar proses bisa lanjut.

### 10.4 Cash In / Cash Out

| Kategori | Contoh | Dampak laci |
|---|---|---|
| Cash In | Modal tambahan, uang pecahan, parkir yang nyata | Tambah jika masuk laci |
| Cash Out | Belanja operasional, refund tunai sah | Kurang bila dari laci |
| Transfer | Deposit manajer, antar pemegang dana | Kurang di pengirim, tambah di penerima |
| Non-cash | Rekening, QRIS, dana eksternal | Tidak mengubah laci |

**Quick Cash-Out untuk belanja bahan/operasional** — sebelum mengambil uang laci:
1. Pilih CASH OUT → BELANJA BAHAN/OPERASIONAL (bukan tombol penjualan/takeaway).
2. Input nominal, penerima, tujuan, divisi, waktu, nota (atau "nota menyusul" dengan tenggat), actor_id.
3. Isi purchase/reference ID bila ada; jangan input ulang biaya sama di petty cash.
4. Approval bila melewati batas nominal — sebelum uang keluar.
5. Posting satu kali; expected cash diperbarui; muncul di laporan shift.
6. Pembatalan → reversal / cash-in balik dengan referensi asal.

Setiap movement mencatat: `created_at, occurred_at, amount, evidence, approval_state, cash_holder_before/after, counterparty, source/destination, reversal_of`. Kategori OTHER wajib catatan minimum; darurat → status perlu pemeriksaan.

### 10.5 Petty cash

Saldo & lokasi sendiri. Bila dibayar dari petty terpisah, expense **tidak** mengurangi expected laci lagi. Replenishment = transfer antar dana, bukan belanja ganda.

### 10.6 Pembelian persediaan internal (Quick Stock Purchase)

1. Pilih barang persediaan tercatat atau ajukan baru sesuai otorisasi.
2. Catat qty, biaya aktual, supplier, nota, sumber pembayaran.
3. Dari laci → cash-out terikat `purchase_id` unik; dari manajer/luar → ledger sumber tersebut.
4. Gudang memvalidasi penerimaan; stok WMS diperbarui.
5. Pembelian, pembayaran, dan pergerakan stok tertaut — **tanpa** take away dummy.

### 10.7 Setoran parkir Rp10.000 — deklarasi wajib

> **PERINGATAN CLOSE SHIFT — UANG PARKIR WAJIB DIPERIKSA.** Apakah uang parkir Rp10.000 hari ini benar-benar sudah diterima kasir atau manajer? Pilih sesuai kenyataan. Jika belum, pilih BELUM DITERIMA beserta alasan; jangan membuat penerimaan fiktif agar shift terlihat balance.

| Pilihan | Posting | Status review |
|---|---|---|
| DITERIMA KASIR — CASH | Tambah laci sekali (receipt nyata) | Verifikasi SOP |
| DITERIMA MANAJER LANGSUNG | Tambah custody manajer | Manager acceptance |
| BELUM DITERIMA | Tidak ada posting; wajib alasan & PIC penagihan | OPEN / FOLLOW-UP |
| TIDAK BERLAKU / PENGECUALIAN | Tanpa posting; justifikasi + persetujuan Owner | EXCEPTION REVIEW |
| NOMINAL BERBEDA | Catat aktual; tampilkan beda vs target | DISPUTED / REVIEW |

- Checklist Close Shift tidak lengkap sebelum status parkir dipilih (nilai 0 tetap input eksplisit). Kasir tetap bisa submit dengan BELUM DITERIMA sebagai exception.
- Target berindeks `outlet + business_date + collection_type` — **tidak** dibebankan ke setiap shift.
- Diterima di shift lain/manajer → jangan kredit kasir pertama.
- Status: BELUM DITERIMA, DITERIMA, MENUNGGU VERIFIKASI, TERVERIFIKASI, TERLAMBAT, DISPUTED.
- Bukan omzet POS; bukan offset untuk menghapus selisih. Kontrol duplikasi per sumber/hari.

### 10.8 Close Shift — Smart Closing wizard (SHF-04)

> **PERHATIAN! PASTIKAN SEMUA UANG SESUAI.** Sebelum mengajukan tutup shift, hitung uang fisik sampai pecahan, cocokkan QRIS, input seluruh pengeluaran, setoran parkir, sisa petty cash, deposit manajer, void/refund, dan beri klarifikasi atas selisih. **JANGAN MASUKKAN NOMINAL PALSU.** Semua tindakan dicatat.

| Step | Layar | Requirement |
|---|---|---|
| 01 | Preclose | Ringkas sales CASH/QRIS, refund/void, pending, cash in/out, deposit, snapshot ledger. Transaksi dikunci mode rekonsiliasi atau transaksi baru memicu recount. |
| 02 | Parkir | Deklarasi wajib (§10.7) |
| 03 | Cash count #1 | **Blind count** — expected tidak ditampilkan sebelum pecahan disimpan |
| 04 | Recount #2 | Form terpisah; **tidak** disalin dari count #1. Beda → tampilkan pecahan yang tidak cocok, minta count #3/pemeriksaan manajer sesuai policy |
| 05 | Variance review | Expected, Actual, Difference besar dengan status KURANG/LEBIH/SESUAI; daftar transaksi pembentuk. Tombol: HITUNG ULANG, PERIKSA TRANSAKSI, BUAT KLARIFIKASI |
| 06 | Submit kasir | KONFIRMASI & AJUKAN CLOSING + penjelasan & lampiran. **Bukan final** |
| 07 | Manager verify | Hitung independen custody & pecahan; hasil kasir tidak otomatis menjadi hasil manajer |
| 08 | Owner final | Preview snapshot → re-auth + TOTP fresh → approve / approve with exception / return / escalate |
| 09 | Archive | PDF snapshot final, report ID, hash, versi |

**Checklist pra-penutupan:** pecahan dihitung & direcount; QRIS PAID/PENDING/refund diperiksa; penerimaan, pengeluaran, pembelian internal, parkir dicatat sesuai kenyataan; deposit diajukan & dikonfirmasi; petty, transfer, sisa laci, void/refund, bukti diperiksa; klarifikasi exception lengkap.

**Penguncian:** opening count, count #1, #2, manager deposit count, manager float count = rekaman ber-ID unik append-only. Transaksi/deposit/pengeluaran yang berubah setelah hitung → `RECOUNT_REQUIRED`, count lama STALE, snapshot approval lama batal. Optimistic concurrency/row lock. Offline → `DRAFT_UNSYNCED`, tidak bisa APPROVED sebelum sinkron. Nol selisih tetap hasil hitung, bukan otomatis valid tanpa bukti.

### 10.9 Atribusi kasir & handover

- Shift mengunci periode, outlet, modal awal, kasir.
- Pergantian kasir wajib hitung + serah terima terdokumentasi; kesalahan shift sebelumnya tidak dibebankan ke penerima tanpa bukti.
- Setiap transaksi, persetujuan, transfer, pembatalan, pengeluaran terikat `actor_id`.
- Sisa laci ke shift berikutnya: dual-acknowledgment; menjadi opening penerima setelah sah.

---

## 11. QRIS: paid vs settlement

### 11.1 Tiga nilai wajib

- **QRIS POS Expected** — total transaksi POS metode QRIS.
- **QRIS Verified Paid** — berhasil menurut gateway/acquirer atau bukti merchant tervalidasi.
- **QRIS Settled** — dana cair ke rekening: gross, refund, MDR aktual, net, pending.

### 11.2 Alur rekonsiliasi

1. Tarik transaksi QRIS POS per shift/business date.
2. Cocokkan reference & status provider; bila belum terintegrasi → upload rekap merchant dengan review.
3. Kelompokkan: PAID, PENDING, FAILED, REFUNDED, DISPUTED, SETTLEMENT_PENDING, SETTLED.
4. Hitung selisih **pembayaran**, bukan hanya setoran rekening.
5. Mismatch → exception + bukti + verifikator.
6. Cash drawer, settlement QRIS, dan bank transfer direkonsiliasi terpisah: `unmatched / in-review / matched`.

> QRIS dibayar pelanggan tetapi belum settle **bukan** uang hilang di laci. Pending tidak dianggap kecurangan. Jika provider belum terintegrasi, tampilkan **NOT_VERIFIED**, bukan nol atau sukses.

---

## 12. Manager Deposit, Vault & custody

### 12.1 Serah terima dua pihak

1. Kasir menghitung & mengajukan nominal.
2. Manajer menghitung uang nyata yang diterima.
3. Sistem membandingkan; beda → **DISPUTED** (tidak diposting seolah cocok).
4. Kedua pihak konfirmasi; bukti + timestamp.
5. Nilai yang benar-benar diserahkan pindah ledger kasir → manajer secara atomik.
6. Manajer mencatat saldo titipan, setoran bank, atau pengembalian float.

### 12.2 Rekening custody

| Akun | Makna |
|---|---|
| Cashier Drawer | Uang fisik laci dalam kuasa kasir |
| Manager Received | Deposit diterima & dihitung ulang manajer |
| Manager Change Float | Sisa pecahan untuk kembalian |
| Manager Safe/Hold | Kas di brankas/penyimpanan manajer |
| Bank Deposit In Transit | Diserahkan ke kurir/petugas setor, belum dikonfirmasi bank |
| Bank Deposited | Selesai berdasarkan slip/mutasi resmi |

### 12.3 Laporan sisa pecahan manajer (wajib)

- Pilih business date & custody account; hitung sisa per pecahan (lembar/koin, subtotal, total).
- Laporkan: deposit diterima, disetor bank, dialihkan sebagai float, pengeluaran sah dari dana manajer, saldo akhir fisik.
- Kolom: `manager_user_id, cashier_user_id, transfer_id, count_id, business_date, recorded_at, denomination_map, foto bukti, lokasi penyimpanan`.
- Saldo manajer **tidak** boleh menutup kekurangan kasir secara otomatis.
- Float ke kasir shift lain → dua konfirmasi → opening kasir penerima.
- Status serah terima manajer **bukan** persetujuan final shift.

**Contoh (simulasi):** terima Rp400.000 → setor bank Rp300.000 → expected Rp100.000 → actual 5 × Rp20.000 = Rp100.000 → selisih 0. Bila actual Rp90.000 → **MANAGER SHORTAGE Rp10.000** sebagai kasus terpisah, tidak dibebankan ke kasir yang memiliki bukti serah terima lengkap.

---

## 13. Closing state machine & Owner Final Approval

### 13.1 State machine anti-bypass

```
OPEN → PRE_CLOSING → COUNT_1_SUBMITTED → COUNT_2_SUBMITTED
     → MANAGER_REVIEW → OWNER_PENDING
     → FINAL_APPROVED | FINAL_APPROVED_WITH_EXCEPTION | RETURNED_FOR_CORRECTION
     → LOCKED
```

- Endpoint lama `PATCH /cash-sessions/{id}/close` wajib dievaluasi; **tidak boleh** satu endpoint menghasilkan CLOSED final hanya dengan `shift:cash` atau manager PIN.
- Kasir boleh submit/re-submit (versi baru) tetapi tidak final.
- Manajer verify deposit, tidak final; bila manajer pihak terkait → review Owner independen.
- Owner: re-auth + TOTP fresh (Better Auth); perubahan data setelah halaman approval dibuka membatalkan challenge.
- `actualCash` tidak bisa dikoreksi tanpa cash count denominations + bukti; tiap revisi berversi.
- Owner tidak tersedia → `AWAITING_OWNER`; shift berikutnya berjalan via handover sah, tanpa fake closed.
- LOCKED: koreksi = reversal/adjustment dengan case workflow, bukan mutasi.

### 13.2 Status approval harian

| Status | Makna |
|---|---|
| DRAFT / AWAITING CASHIER | Kasir belum mengajukan |
| WAITING MANAGER | Kasir selesai, manajer belum verifikasi |
| NEEDS INVESTIGATION | Exception material, bukti kurang, atau dispute |
| READY FOR OWNER | Terverifikasi/terdokumentasi untuk keputusan |
| APPROVED | Final tanpa exception terbuka yang memengaruhi balance |
| APPROVED WITH EXCEPTION | Final dengan selisih/case tetap OPEN |
| RETURNED FOR CORRECTION | Dikembalikan dengan koreksi terlacak |

### 13.3 Standar verifikasi Final Closing

- Role Owner diverifikasi server & DB (bukan menyembunyikan tombol).
- Step-up re-auth + TOTP baru; otorisasi diikat ke **hash ringkasan keuangan, shift ID/business date, nonce sekali pakai, expiry pendek**.
- Rate limit, idempotency key, transaksi DB, lock → cegah double closing & concurrent approval.
- Manager PIN = kontrol tersendiri, bukan pengganti MFA Owner, bukan fallback recovery tanpa sepengetahuan Owner.
- Kode OTP tidak pernah masuk log. Secret TOTP tidak disimpan plaintext.
- Tidak ada auto-close yang melewati Owner. MFA recovery terpisah & diaudit.

### 13.4 Financial Approval Center — date-first

Owner memilih tanggal operasional (WIB); semua shift tanggal itu tampil, termasuk yang melewati tengah malam. Tanggal transaksi, opening, verifikasi manajer, dan approval Owner dibedakan.

1. Kasir submit tiap shift.
2. Manajer menilai deposit, fisik, QRIS, bukti, selisih.
3. Sistem konsolidasi per `business_date` tanpa double count handover (transfer_id sama dieliminasi).
4. Owner melihat detail per kasir & keseluruhan.
5. Owner memeriksa exception; minta revisi atau tutup dengan exception.
6. Re-auth + TOTP → snapshot dikunci.
7. PDF per shift + PDF konsolidasi tanggal.

### 13.5 Owner Approval 360 — Financial Decision Dossier

| Prioritas | Panel | Isi |
|---|---|---|
| P0 | Executive Decision Strip | Outlet, business date, status, jumlah shift, total money in/out, 3 exception terbesar |
| P0 | Decision Summary | Gross/net sales, cash, QRIS paid/pending/settled, expected/actual, parkir, open case, approval status |
| P0 | Custody Map | Laci, deposit manajer, float, safe, bank in transit, bank settled — nilai & pemegang |
| P0 | Variance Explanation | Komposisi delta per shift & holder: cash sale, out, in, deposit, refund, beda count 1 vs 2, transfer belum diterima |
| P1 | Risk Findings | Kartu LV1–LV5, sumber, batasan bukti, reviewer |
| P1 | Daily Timeline | Open, sale, refund, void, cash-out, deposit request/receipt, recount, alert, approval (WIB) |
| P1 | Cases | Investigasi, terbukti, ditolak, false positive, closed with exception |
| P2 | Monthly Context | Hari shift, variance total, rate per omzet/shift, kasus berulang, kualitas bukti |
| P2 | Decision Controls | Approve clean · Approve with exception · Request recount · Return for correction · Escalate audit — alasan wajib |

**Pertanyaan Owner yang harus bisa diklik:** berapa uang seharusnya ada; berapa fisik ada; apa penyebab selisih; ada salah CASH/QRIS; parkir sudah masuk; siapa terakhir memegang uang; siapa perlu diperiksa (person + role + window + evidence, bukan vonis); keputusan final apa.

**Guardrails keyakinan:** pisahkan nominal terbukti, pending verifikasi, belum cocok; indikator kelengkapan data (mis. 16/18 dokumen); "belum terverifikasi" bila provider/mutasi bank belum ada; setiap angka menampilkan `source_transaction_id / cash_count_id / handover_id / settlement_id / audit_event_id`; detail di side drawer tanpa meninggalkan ringkasan.

> **DUA KEPUTUSAN BERBEDA:** *FINAL CLOSING* mengesahkan catatan (boleh dengan exception). *CASE RESOLUTION* menyatakan apakah selisih terselesaikan dan sebabnya terbukti. *PAYROLL DEDUCTION AUTHORIZATION* adalah proses ketiga yang terpisah. Persetujuan tidak memaksa exception hilang.

---

## 14. Risk LV1–LV5, investigasi & keadilan pemeriksaan

### 14.1 Explainable Risk Engine

Tingkat risiko = **prioritas pemeriksaan**, bukan kepastian penipuan. Threshold dapat diaudit & dikonfigurasi Owner; setiap level memiliki dasar transaksi yang bisa dibuka.

| Level | Makna | Respons aman |
|---|---|---|
| LV1 — INFO | Pola biasa / administratif kecil | Logging, edukasi (mis. nota belum diunggah) |
| LV2 — LOW | Ketidaksesuaian kecil/sekali | Reminder, review rutin (mis. count 1 vs 2 berbeda) |
| LV3 — MEDIUM | Berulang / bukti belum lengkap | Case review manajer; Owner memantau |
| LV4 — HIGH | Penyimpangan material / rantai kas terputus | Notifikasi Owner; verifikasi independen diprioritaskan |
| LV5 — CRITICAL | Indikasi manipulasi ledger / akses tidak sah / kerugian material berbukti awal | Kunci operasi berisiko bila perlu; notifikasi Owner; audit independen |

### 14.2 Sinyal

- **Kasir:** void/refund setelah bayar, salah metode, expense tanpa bukti, keterlambatan mencatat, count 1–2 berbeda berulang, shortage belum dijelaskan.
- **Manajer:** beda transfer diterima vs fisik, float tidak cocok, setoran bank tanpa bukti, penundaan handover, perubahan setelah verifikasi, approval tanpa izin.
- **Keduanya:** login di luar jadwal, privilege escalation, duplikasi refund, cross-user mismatch, perubahan setelah cut-off, koreksi tanpa reversal, percobaan Final Closing tanpa MFA atau ubah snapshot.
- Skor mempertimbangkan denominator (jumlah shift, transaksi, omzet, uang dipegang, error sistem diketahui). **Dilarang** menilai berdasarkan ciri pribadi tidak relevan; tidak ada leaderboard "pegawai terburuk/curang".

### 14.3 Field risk alert

`risk_level, rule_id, rule_version, event_at, detected_at, person_role, custody_scope, transactions, evidence_links, confidence/completeness (kelengkapan bukti, bukan peluang curang), disposition (OPEN | FALSE_POSITIVE | EXPLAINED | SUBSTANTIATED | DISPUTED | CLOSED), reviewer`.

### 14.4 Investigasi per Case ID

1. Deteksi selisih/anomali → **OPEN**.
2. Kasir recount & kronologi/bukti → **CASHIER_EXPLANATION**.
3. Manajer menelusuri transaksi, serah terima, sumber bayar → **UNDER_REVIEW** (bukan bila manajer pihak terkait).
4. Sistem menguji ulang formula, sumber pembayaran, counts, custody untuk menyingkirkan bug/duplikasi.
5. Owner menetapkan berdasarkan bukti.
6. Tindak lanjut (pelatihan, koreksi sah, perbaikan SOP, penilaian tanggung jawab) dicatat terpisah.

**Pertanyaan audit utama:** nominal fisik di opening, sebelum handover, saat diterima manajer, saat sisa dihitung; count 1 vs 2 dan siapa mengubah; uang berpindah tanpa transfer_id; setoran bank cocok mutasi; di tahap mana selisih pertama muncul; mungkinkah POS/QRIS/webhook/retry/settlement penyebab; apakah bukti cukup atau masih dugaan.

**Kemungkinan penyebab:** kesalahan hitung, cash-out tidak dicatat, salah metode bayar, transfer belum disahkan, refund/void, masalah sistem (idempotency, webhook, timezone, duplicate event).

### 14.5 Matriks akuntabilitas menurut custody

| Kondisi | Perlakuan |
|---|---|
| Shortage sebelum serah terima | Case kasir + recount, sales, cash-out, bukti; tanpa vonis |
| Handover tidak cocok | DISPUTED kedua pihak |
| Deposit diterima penuh lalu manajer kurang | Case manager custody; kasir tidak otomatis bertanggung jawab |
| Float ke kasir shift berikut | Transfer + konfirmasi dua pihak |
| Cash-to-bank tidak cocok | Verifikasi bukti bank, value date, petugas, in-transit |
| QRIS pending settlement | Case rekonsiliasi provider, bukan custody kasir |

### 14.6 Outcome kasus — dilarang menyimpulkan otomatis "pencurian"

| Status akhir | Makna |
|---|---|
| NO_UNEXPLAINED_DISCREPANCY | Cocok dalam cakupan diperiksa |
| ERROR_SYSTEM_ISSUE_VERIFIED | Kesalahan operasional/teknis berbukti |
| UNRESOLVED_INSUFFICIENT_EVIDENCE | Selisih ada, sebab/pelaku belum pasti |
| POTENTIAL_MISCONDUCT_REVIEW | Indikator perlu investigasi, belum final |
| CONFIRMED_POLICY_VIOLATION | Terbukti lewat pemeriksaan manusia + bukti |
| REFERRED_FOR_FORMAL_INVESTIGATION | Perlu proses formal; bukan vonis sistem |

### 14.7 Independensi & hak pegawai

- Kasir boleh menanggapi & melampirkan bukti; tidak mengubah transaksi asli.
- Manajer tidak menyelesaikan kasus yang menyangkut dirinya; Owner/reviewer independen.
- Pegawai terkait memperoleh rincian temuan, bukti relevan, dan kesempatan koreksi/keberatan — tetap berlaku walau closing sudah disahkan dengan exception.
- Jangan menyatakan *"kasir mencuri pukul 20:15"* dari log; hanya *"peristiwa terkait pukul 20:15; status investigasi …"*.
- Tindakan pengamanan tanpa vonis: wajib recount, penangguhan transaksi high-risk sampai izin, cek bukti. **Tidak** otomatis memecat, menahan upah, atau mencabut akses permanen.

---

## 15. Payroll liability & kepatuhan ketenagakerjaan

### 15.1 Alur (terpisah dari closing)

1. Selisih terjadi → case tanpa asumsi pelaku.
2. Kasir klarifikasi, lihat bukti, ajukan keberatan.
3. Manajer memverifikasi besaran & kronologi.
4. Owner + HR/legal menilai kesengajaan/kelalaian & dasar perjanjian/peraturan sah.
5. Jika syarat terpenuhi → proposal ganti rugi ke payroll.
6. Payroll mengecek seluruh potongan & batas; tidak memotong hanya dari selisih.

### 15.2 Catatan hukum

PP 36/2021 Pasal 63 mengatur pemotongan upah termasuk denda/ganti rugi dengan syarat dalam Perjanjian Kerja, Peraturan Perusahaan, atau PKB; Pasal 65 membatasi agregat paling banyak 50% dari setiap pembayaran upah. PP 36/2021 telah diubah melalui PP 51/2023 dan PP 49/2025. **Tinjauan HR/penasihat hukum wajib** sebelum kebijakan diterapkan; dokumen ini bukan opini hukum final. Fitur salary-deduction ditahan pada review manual sampai sah.

### 15.3 Safeguards

- Konfirmasi peringatan Open Shift ≠ persetujuan potong gaji.
- Nominal shortage bulanan ≠ utang pegawai.
- Data personel: akses minimal, audit siapa mengakses/ekspor, retensi sesuai hukum.
- Data pegawai sensitif tidak dipakai melatih model tanpa izin & dasar pemrosesan.

---

## 16. Rekap bulanan & timeline timestamp

### 16.1 Monthly Accountability Ledger

Filter: tanggal, rentang custom (lintas bulan), minggu, bulan, 7/30/90 hari, outlet, kasir, manajer, shift, tender, kategori, status parkir, LV, status case, penyebab.

| Metrik | Definisi / larangan |
|---|---|
| Total Cash In/Out kasir | Arus fisik laci nyata; bukan belanja Owner via transfer |
| Observed shortage | Jumlah kurang dari hitungan final; **tidak dinetkan** dengan surplus |
| Observed surplus | Terpisah; tidak otomatis pendapatan; tetap exception |
| Open/unresolved | Saldo kasus belum diputuskan |
| Explained/corrected | Ditutup via reversal/perbaikan sah |
| Confirmed loss | Kerugian terbukti & disahkan keputusan kasus |
| Recovered amount | Pengembalian yang benar-benar diterima |
| Payroll review pending | Menunggu HR/legal; bukan potongan |
| Manager custody variance | Dipisah dari kasir |
| Parking compliance | Target vs received vs outstanding per business_date |
| Tender correction rate | Pergantian CASH/QRIS valid/invalid berdasarkan payment ref |
| Cases by LV | Dengan true/false positive |
| Trend/frequency | Shift selisih ÷ shift sebanding; relatif terhadap cash handled |

Roll-forward: saldo kasus awal bulan + baru − resolved, memisahkan koreksi data dari pembayaran penggantian. Drill-down: harian → shift → pecahan → movements → handover → rekonsiliasi → case → keputusan Owner. Heatmap per tanggal/shift tanpa membandingkan pegawai dengan volume kerja berbeda secara tidak adil.

### 16.2 Timestamp yang wajib dibedakan (UI WIB, simpan UTC)

| Field | Kegunaan |
|---|---|
| `occurred_at` / `event_at` | Waktu kejadian dari sumber — bukan otomatis waktu pelanggaran |
| `recorded_at` | Waktu masuk server (deteksi backfill) |
| `detected_at` | Rule engine membuat alert |
| `recount_at` | Waktu hitung tertentu |
| `transfer_requested_at` / `transfer_received_at` | Pengajuan & penerimaan handover |
| `reviewed_at` | Diperiksa manusia |
| `confirmed_at` | Keputusan kasus disahkan |
| `owner_approved_at` | Laporan final disahkan (≠ kasus selesai) |

---

## 17. Produk, harga, resep & HPP

Owner dapat mengganti harga jual dan harga beli bahan kapan pun, di UI atau (fase lanjut) via AI — terikat SKU/varian, outlet, channel, event, waktu efektif.

| Sub-domain | Aturan |
|---|---|
| Master produk | CRUD produk, kategori, varian, addons, foto, visibility, deskripsi; soft delete bila pernah ditransaksikan |
| Harga reguler | Owner override tanpa fixed markup; warning margin rendah/negatif; price version baru |
| Harga event | Price list terpisah + effective window + menu event; tidak overwrite reguler |
| Harga bahan | Supplier-unit-price-validity; konversi kg/g, l/ml, pak/pcs diverifikasi |
| Resep/BOM | Versioning + impact preview; tidak mengubah historis diam-diam |
| HPP | Future estimated HPP dihitung ulang; historical COGS mengikuti metode persediaan saat transaksi |
| POS & menu digital | Harga aktif di-resolve server-side; order lama menyimpan unit price snapshot; cache invalidation berbasis versi |
| Import/ekspor | Mapping + preview + conflict report; tidak menimpa master tanpa persetujuan |

> **FREE PRICING, SAFE HISTORY:** angka valid apa pun boleh (termasuk Rp0 dengan alasan khusus), tetapi transaksi lama, cost historis, dan ledger tidak berubah retroaktif.

**Microcopy konfirmasi:** *"Anda akan mengubah harga 12 varian untuk outlet Garage Tebing Tinggi mulai 27 Oktober 2026 pukul 15.00 WIB. Harga transaksi terdahulu dan daftar harga event tidak berubah. 3 SKU memiliki estimasi margin di bawah 0%. Periksa dampak margin sebelum menerapkan."* Tombol: **Batalkan / Konfirmasi dan Terapkan**; setelah submit tampilkan receipt.

---

## 18. WMS, supplier, Bar/Kitchen & KDS

### 18.1 Workflow closing & belanja besok

1. **Divisi** (Bar & Kitchen) memeriksa stok aktual saat closing dan mengajukan kebutuhan sesuai master material/resep.
2. **Gudang** konsolidasi lintas divisi, cross-check stok, rekomendasi supplier & harga terakhir.
3. **Owner** melihat dampak anggaran; menyetujui/memperbaiki PR/PO.
4. **Receiving** parsial/penuh: cek unit, harga aktual, dokumen, discrepancy; stok diperbarui via ledger mutasi.
5. **Analisis AI**: pemborosan, stok minimum, pembelian ganda, material idle, estimasi pemakaian, stock-out.

### 18.2 Integritas persediaan

- Stock adjustment wajib reason, bukti, timestamp, actor, before/after, approval policy; hard delete movement dilarang.
- Permintaan divisi tidak mengubah stok sebelum receiving.
- Perubahan supplier price tidak mengubah invoice/receipt yang sudah ditutup.
- Forecast AI tidak boleh disalahartikan sebagai stok hitung fisik.

### 18.3 KDS state machine

`RECEIVED → ACCEPTED → IN_PROGRESS → READY → SERVED | CANCELLED` — lompatan tak sah ditolak backend kecuali exception approval. UI: tile sentuh besar, timer/umur tiket, batch queue, stock-out, PIC.

---

## 19. Member, HR, event, marketing, meja & QR

| Area | Operasi owner & aturan |
|---|---|
| Karyawan & role | Approve akun Google baru (§06), role/outlet, jadwal, shift, absensi, arsip; info sensitif role-restricted |
| Payroll | Preview slip & insentif dari sumber jelas; finalisasi/koreksi/distribusi setelah approval; terpisah dari closing |
| CRM/member | Akun, tier Silver/Gold/Platinum, poin (perubahan via ledger poin), benefit, consent, segmen; migrasi tidak menghilangkan poin/tier/histori/referral |
| Menu digital & meja | CRUD kategori/foto/promo, QR meja, status order, dispatch ke KDS, jadwal publikasi |
| Event Manager | Landing, daftar undangan, personal link, RSVP, menu & harga event, rekap; **tanpa** check-in QR/otomasi yang tidak diminta |
| Konten & ads | Draft → approve → publish → schedule; arsip aset; iklan hanya via connector berotorisasi |
| Owner settings | Jam operasional, outlet, notifikasi, approval, template, konektor, feature flags |

**Privasi komunikasi:** data pelanggan/karyawan tidak untuk pengiriman massal tanpa tujuan sah, consent, dan pembatasan penerima. Email keluar wajib preview penerima, subjek, lampiran.

---

## 20. Laporan, PDF/Excel, Google Drive & Gmail

### 20.1 Katalog laporan

Operasional harian/mingguan/bulanan; performa divisi; tren produk; stok & forecast; audit shift, selisih, parkir, QRIS vs settlement, transfer, petty, refund/void; P&L, biaya, cash flow, penjualan per channel, margin & HPP; WMS (valuasi, PO, receiving, waste, kebutuhan beli); karyawan (absensi, jadwal, payroll — role berhak); event, member, kampanye. Setiap laporan memiliki `report_id, parameter query, generated_at, data_cutoff, sumber data, versi definisi KPI`.

### 20.2 Dokumen PDF resmi keuangan

| Jenis | Nama file | Isi utama |
|---|---|---|
| A. Shift | `GARAGE_TEBING_TINGGI_SHIFT_YYYY-MM-DD_SHIFT-ID.pdf` | Penanggung jawab, recount, drawer, transaksi, QRIS, handover, exception, approval |
| B. Harian | `GARAGE_TEBING_TINGGI_CLOSING_YYYY-MM-DD.pdf` | Seluruh shift, keputusan Owner, rekonsiliasi, kasus terbuka |
| C. Bulanan | `GARAGE_TEBING_TINGGI_FINANCIAL_AUDIT_YYYY-MM.pdf` | Tren, kasir/manajer, saldo kasus, risk alerts |
| D. Kasus | `GARAGE_TEBING_TINGGI_CASE_CASE-ID.pdf` | Kronologi WIB, bukti, tanggapan, disposition, pemeriksa, keputusan |

Tanggal = business date. Revisi sah → suffix `_V02`, `_V03`; arsip lama tetap.

**Urutan isi PDF harian:**
1. Cover — outlet, business date, jumlah shift, status final, versi, QR verifikasi dokumen opsional.
2. Executive Summary — saldo seharusnya, fisik, selisih, QRIS pending, uang di manajer, parkir, open case, status approval.
3. Cash Position — expected vs actual per kasir; denominasi count #1/#2; timestamp; variance.
4. Manager Custody — deposit, sisa pecahan, setor bank, safe, manager variance.
5. QRIS — paid, refund, unsettled, settled, MDR aktual, unmatched IDs.
6. Cash Flow — cash in/out, petty, parkir, pembelian stok, sumber dana; belanja transfer Owner diberi label "non-drawer".
7. Tender Summary — CASH/QRIS, verified/pending/failed/settled, koreksi metode terotorisasi.
8. Incident/Risk — LV1–LV5, rule, event/detected/reviewed/confirmed, bukti, status.
9. Month-to-date — shortage/surplus terpisah, unresolved, confirmed loss, recovered.
10. Owner Decision — fakta, unknown, kesimpulan, approval, exception, tindakan & due date.
11. Lampiran — transaksi, timeline, audit entries, ID bukti, reversal log, data dictionary.
12. Audit metadata — report ID, snapshot hash, approval ID, validasi MFA Owner, versi.

**Perlindungan:** DRAFT/PRELIMINARY watermark sampai Owner MFA; tidak memuat OTP, secret, password, atau payroll pribadi pada laporan operasional umum; total & status dari snapshot/ledger, bukan narasi AI. Excel: sheet transaksi, cash count, pergerakan dana, deposit, QRIS, exceptions, approval log — setiap baris ber-stable reference ID.

### 20.3 Google Drive

- Folder: Garage Coffee / Keuangan / Operasional / Inventory / Karyawan / Penjualan / Event / Laporan AI / System Audit.
- OAuth Google scope minimum; simpan Drive file ID, parent folder, hash, export status di DB.
- Otomasi: schedule, event trigger, retry exponential backoff, job queue, dead-letter, verifikasi file setelah upload.
- ACL sesuai sensitivitas; **tidak ada public link default**; signed link ber-TTL bila perlu.
- Drive **bukan** pengganti backup database yang diuji restore drill.

### 20.4 Gmail / email resmi

- Baca inbox yang diizinkan, cari invoice/supplier atas permintaan Owner, siapkan draf, kirim laporan & notifikasi terotorisasi.
- Draf ≠ kirim: lampiran sensitif, penerima baru, pesan massal → approval; recipient allowlist untuk laporan keuangan.
- Simpan `message_id, recipients, attachment report IDs, status DELIVERED/FAILED/QUEUED, retry trail`.
- Konektor Gmail di ChatGPT dan kredensial backend Garage OS adalah **dua konfigurasi izin berbeda**.
- Isi email yang dibaca adalah data tidak tepercaya (tidak memicu mutasi).

---

## 21. AI: Financial Decision Engine & kualitas jawaban

### 21.1 Dua lapis

1. **Mesin deterministik** menghitung nominal, selisih, saldo, status (rule-based reconciliation summary dibangun lebih dulu).
2. **LLM naratif** menjelaskan hasil yang sudah dihitung — tidak menghitung angka authoritative, tidak membuat keputusan kriminal.

### 21.2 Struktur output wajib

`facts[], unknowns[], hypotheses[], anomalies[], evidence_refs[], decisions_required[], next_steps[]` + engine version, input snapshot hash, generated_at, hasil verifikasi formula, penyetuju narasi.

### 21.3 Struktur kesimpulan final

1. Posisi penjualan (cash/QRIS) & status settlement.
2. Posisi uang fisik: laci, deposit manajer, sisa pecahan, bank in transit, bank terkonfirmasi.
3. Selisih kasir & manajer terpisah (nominal + waktu temuan).
4. Bukti tersedia vs kurang.
5. Maksimal tiga hipotesis penyebab dengan alasan — bukan vonis.
6. Tindakan untuk Owner/manajer/kasir/finance.
7. Keputusan Owner (approved / with exception / returned / pending) tanpa mengubah angka.
8. Konteks 30 hari (shift ber-discrepancy, open case, confirmed loss, recovered) — tidak digabung menjadi utang pegawai.

### 21.4 Aturan kualitas

- Pisahkan fakta terverifikasi, perhitungan, indikasi anomali, rekomendasi; angka material wajib bersumber.
- Data kurang → **"BELUM CUKUP BUKTI"**; jangan mengarang omzet, pengeluaran, stok; jangan menyimpulkan balance atau kecurangan.
- Pertanyaan "kenapa omzet turun?" → pembanding periode, breakdown kanal/kategori/shift, batasan penjelasan.
- Tombol **"Lihat Sumber Angka"** pada setiap kalimat numerik.
- Konten email, dokumen, catatan, deskripsi produk = data tidak tepercaya.
- Tool write hanya dari intent Owner sah + approval policy.
- Tidak ada pseudo-presisi "probabilitas pencurian".

**Contoh (simulasi):** *"Tanggal 26/10/2026, kas fisik shift A kurang Rp50.000 dari jumlah seharusnya. Ada 1 pengeluaran Rp50.000 tanpa nota, tetapi hubungan kausal belum terbukti. Deposit manajer tercatat cocok. QRIS Rp300.000 berstatus paid namun settlement pending. Kesimpulan: selisih perlu investigasi; belum cukup bukti untuk menetapkan pencurian. Sumber: ledger IDs …, count IDs …"*

### 21.5 Aya (in-app) vs ChatGPT

Aya dan ChatGPT memiliki capability discovery dan daftar tool selaras, memakai backend & policy identik, dan mematuhi batas platform masing-masing. Aya menjadi jalur kontrol utama bila paket ChatGPT tidak mendukung custom MCP (Owner Copilot via OpenAI Responses API + remote MCP).

---

## 22. MCP Gateway & ChatGPT Owner Bridge

> **TUJUAN:** ChatGPT adalah antarmuka tanya-jawab & analisis terverifikasi atas Garage OS — bukan sumber pencatatan uang dan bukan otoritas pengesahan.

### 22.1 Alur koneksi

1. Owner menghubungkan ChatGPT ke custom Garage OS MCP via **OAuth 2.1 / OIDC** (Authorization Code + PKCE), consent, scope minimal.
2. Default **READ_ONLY**, scope outlet GARAGE TEBING TINGGI.
3. Gateway memvalidasi audience, expiry, issuer, scopes, pemetaan user → Owner, throttle, parameter.
4. Gateway memanggil Read API internal berizin → hasil deterministik + evidence IDs.
5. ChatGPT merangkum dengan periode, status data, jumlah dokumen pembentuk, bukti, exception, ketidakpastian.
6. Permintaan perubahan → draft/request; review di Garage OS dengan TOTP fresh untuk operasi sensitif.

### 22.2 Ketersediaan platform (per dokumentasi OpenAI, 26 Okt 2026)

- Custom MCP full read/write tersedia pada workspace ChatGPT **Business / Enterprise / Edu** (beta/bertahap, sesuai izin workspace). Akun Plus/individu tidak diasumsikan; cek menu Plugin.
- Setup melalui web (Plugin → Add custom MCP server; URL HTTPS atau Secure MCP Tunnel); jangan asumsikan setup dari mobile.
- Bearer `gk_agent_…` raw **tidak** menggantikan OAuth/OIDC; API key, bearer, cookie, password tidak pernah ditempel di percakapan.
- Jika tidak tersedia → Owner Copilot in-app (Aya). **Jangan klaim terhubung sampai uji end-to-end memberi operation receipt valid.**

### 22.3 Komponen teknis

| Komponen | Rancangan |
|---|---|
| Endpoint | `https://garagecoffee.id/api/mcp/chatgpt` (OAuth-scope khusus); `/api/mcp` existing dipertahankan untuk agent internal sampai migrasi & hardening |
| Transport | Streamable HTTP; spesifikasi yang didukung ChatGPT berdasarkan contract test |
| Authn | OAuth 2.1/OIDC bridge, PKCE, discovery metadata, issuer & audience validation, TTL pendek, refresh, revoke |
| Authz | Scope `read:finance, read:shift, read:cash_ledger, read:incident, read:reports, read:<domain>`; fase lanjut `write:<domain>.<action>`; per outlet/row/role; **tanpa wildcard** |
| Step-up | Final closing & perpindahan kas besar hanya di Owner UI setelah TOTP fresh |
| Data | JSON bertipe: integer IDR, ISO timestamp + WIB, `evidence_refs, verified_at, freshness, source_coverage` |
| Minimisasi | Redaksi HR/payroll & pelanggan; signed report link TTL pendek, bukan base64 PDF |
| Audit | Per call: correlation_id, actor, tool, params tersensor, waktu, range, result count/status; tanpa token |
| Kill-switch | Revoke tokens, pause writes, disable gateway |

### 22.4 Katalog tool

**Discovery & sistem:** `system.list_modules`, `system.get_capabilities`, `system.health`, `get_system_financial_health` (freshness, connector health, pending jobs, backup/restore last test).

**Read finance (peluncuran):**

| Tool | Output wajib |
|---|---|
| `get_financial_overview(date\|range, outlet)` | Gross/net sales, cash & QRIS terpisah, drawer, manager vault, petty, exception count, fresh_as_of |
| `get_shift_reconciliation(shift_id)` | Expected, actual #1/#2, discrepancy, ledger seq, reviewers, status, source IDs |
| `list_cash_transactions(date, actor, type)` | Pagination, ledger IDs, cash in/out, kategori, source/destination, occurred_at WIB |
| `get_qris_reconciliation(date)` | Paid vs pending vs settled, provider ref |
| `get_parking_daily_status(date)` | Deklarasi parkir, aktor, bukti |
| `get_manager_cash_custody(date)` | Received, sisa denominasi, setoran bank, attestation, variance |
| `get_cashier_monthly_variances(month, staff?)` | Shortage/surplus terpisah, open/closed, denominator, trend |
| `get_risk_findings(level, range)` | LV, rule reason, evidence, event/detected/reviewed, status |
| `get_financial_timeline(case_id)` / `get_financial_case(case_id)` | Kronologi, custody chain, verified vs suspected, klarifikasi, outcome |
| `get_approval_queue(date)` | Submission, manager review, Owner pending, blockers |
| `get_daily_report(date)` | Status snapshot, versi, signed PDF URL bila berhak |

**Read universal:** `data.search`, `data.get`, `analytics.ask` (semantic mapping ke metrik tervalidasi), `reports.history`, `audit.get_operation`, `audit.search`, `drive.find_files`, domain read `pos.* / inventory.* / products.* / staff.* / member.* / event.* / kitchen.* / content.* / tables.*` (dengan redaksi).

**Write bertahap (fase lanjut, bukan peluncuran):**
- Preview: `data.preview_create`, `data.preview_patch`, `data.preview_archive`, `recovery.preview`.
- Commit (token terikat preview + actor + expiry): `data.commit_create`, `data.commit_patch`, `data.commit_archive`.
- Approval: `approval.request`, `approval.status` — `approval.confirm` untuk R2/R3 **dikonfirmasi di Garage OS UI**, bukan oleh agent.
- Laporan & otomasi: `reports.generate`, `drive.archive_report`, `email.create_draft`, `email.send_approved`, `jobs.schedule/status/cancel`, `alerts.configure`.
- Draft finansial: `request_review_note_draft`, `request_investigation_draft`.

**Payload minimum write:** `request_id, actor_context, resource_type, resource_id, expected_version, patch_or_values, reason, scope, idempotency_key, dry_run_ref, approval_token, effective_at`. Respons: `status, operation_id, before/after, audit_ids, conflicts, async_job_id, verification`.

### 22.5 Tool yang DITOLAK untuk ChatGPT/agent umum

- `garage_api` raw ke `/api/*`, arbitrary HTTP proxy, SQL bebas, shell VPS, dump pelanggan/payroll.
- Transfer dana, ubah ledger historis, tandai QRIS paid tanpa provider, override risk finding, approve Final Closing, auto-payroll deduction, rotate secret, grant role kritis, hapus/ubah audit log, recovery.execute atas data finansial.
- Agent tidak pernah menyetujui tindakannya sendiri.

### 22.6 Ancaman & kontrol

| Risiko | Kontrol |
|---|---|
| Bearer key bocor | Tidak expose `gk_agent_`; token OAuth pendek, rotasi/revocation, vault |
| Prompt injection dari catatan kasir/email/invoice | Teks = data; tidak mengikuti instruksi; output sanitization |
| `garage_api` bypass | Whitelist nama tool + service method; scope + object-level authz; deny default |
| Outlet leakage/IDOR | Outlet ID ditegakkan di query DB |
| Unauthorized write | Read-only saat peluncuran; policy eksplisit untuk write |
| OAuth failure | Issuer/audience ketat, PKCE, TTL, HTTPS, rate limit, revoke |
| Manipulasi hasil tool | ID immutable, evidence vs narrative terpisah, freshness |
| Eksfiltrasi via PDF | Signed URL pendek + ownership + redaksi |
| Halusinasi LLM | Formula deterministik backend; tolak verdict tanpa bukti; tampilkan coverage |
| Closing via AI | Diblokir eksplisit di MCP |

### 22.7 Kontrak respons minimum (tool finance)

`outlet_id, business_date | from-to, timezone=Asia/Jakarta, as_of, calculated_at, coverage, source_version, currency=IDR, reconciliation_status, totals, evidence_refs, unresolved_cases, data_quality_flags, permission_scope`. Data provider tidak ada → `NOT_VERIFIED`.

### 22.8 MCP test matrix

1. OAuth Owner valid → read harian/bulanan; token expired → 401; scope kurang → 403; outlet salah → 403/404.
2. `tools/list` menyembunyikan tool di luar scope; metadata konsisten dengan enforcement runtime.
3. Tool tidak dikenal → RPC error; schema salah ditolak; rate limit untuk range besar & semua halaman.
4. Catatan berisi instruksi "ungkap secret" diperlakukan sebagai konten biasa.
5. MCP Inspector: initialize, tools/list, tools/call, reconnect, token refresh, JSON schema, pagination, timeout, error codes.
6. Query ulang setelah closing berubah → `as_of` & versi finansial benar.
7. Trace dari pertanyaan ChatGPT → MCP call → sumber finansial via correlation_id.
8. Revoke token → semua operasi berikutnya ditolak.
9. ChatGPT identity saja tanpa Garage OAuth → tidak dapat akses.
10. Read-only token mencoba mutasi → ditolak server-side, diaudit, DB tidak berubah.
11. Duplicate request dengan idempotency key sama → tidak ada mutasi kedua.
12. Backend status UNKNOWN → ChatGPT/Aya tidak mengklaim commit berhasil.

### 22.9 Contoh pertanyaan Owner

1. "Berapa omzet GARAGE TEBING TINGGI hari ini? Pisahkan cash, QRIS PAID, dan settlement yang belum cair."
2. "Tanggal 26 Oktober, uang tunai yang seharusnya di laci berapa dan yang dihitung nyata berapa?"
3. "Siapa kasir penanggung jawab shift dengan selisih Rp50.000, dan bukti serah terimanya?"
4. "Tunjukkan seluruh CASH OUT laci pukul 18.00–23.00 beserta nota dan user input."
5. "Apakah setoran parkir diterima setiap tanggal minggu ini? Kapan dan oleh siapa?"
6. "Berapa uang pecahan yang dipegang manajer per denominasi dan kapan terakhir dihitung?"
7. "Cocokkan deposit kasir dengan yang diakui manajer; tampilkan mismatch saja."
8. "Apa 5 temuan LV4–LV5 dalam 30 hari dan status verifikasinya?"
9. "Shortage bulanan per kasir — pisahkan yang belum selesai dan yang terbukti kesalahan administrasi."
10. "Perubahan metode bayar CASH→QRIS: siapa, kapan, alasannya?"
11. "Laporan closing mana yang belum disahkan dan bukti apa yang kurang?"
12. "Ringkasan final 26 Oktober: angka benar, yang belum terverifikasi, risiko prioritas, rekomendasi. Jangan menuduh tanpa bukti."
13. "Analisa Garage hari ini, semua divisi." → POS, shift, ledger, WMS, KDS, member dengan data cutoff & evidence.
14. "Buat belanjaan besok dari permintaan bar dan dapur." → requests + on-hand → supplier/biaya → purchase plan untuk approval.
15. "Buat laporan, simpan ke Drive, email ke akun saya." → generate → verify → upload → capture ID → draft/send sesuai approval.

---

## 23. UI/UX: prinsip, IA & navigasi

### 23.1 North Star

Satu tugas utama per layar; data penting mudah ditemukan; setiap perubahan sensitif punya penjelasan, persetujuan sah, dan bukti hasil. **Lebih mudah digunakan tanpa mengurangi kontrol bisnis.** Redesign memperbaiki pekerjaan pengguna, navigasi, feedback, penanganan kesalahan, dan konsistensi — bukan sekadar gaya visual.

### 23.2 Prinsip UX

| # | Prinsip | Implementasi |
|---|---|---|
| 01 | Task-first | Halaman mengikuti pekerjaan nyata, bukan struktur tabel DB |
| 02 | Progressive disclosure | Kontrol lanjutan muncul sesuai konteks, tanpa menghilangkan affordance penting |
| 03 | Visible system state | Pembayaran, closing, stok, email, job: pending / sukses / gagal / belum terverifikasi |
| 04 | Error prevention | Cegah salah kanal bayar, kas keluar tanpa catatan, duplikasi, perubahan tak sengaja |
| 05 | Role-based context | Dashboard & navigasi berbeda per role |
| 06 | Reversible when legal | Undo untuk reversibel; arsip untuk berelasi; jurnal koreksi untuk posted |
| 07 | Evidence by default | Angka sensitif dengan waktu sumber, status verifikasi, jalur ke transaksi |
| 08 | Responsive realism | Sesuai hardware (printer, QR scanner, tablet, keyboard) |

### 23.3 Personas & JTBD

| Aktor | Pekerjaan utama | Primary space |
|---|---|---|
| Owner | Kondisi bisnis, prioritas masalah, keputusan + bukti | Dashboard 360 / Approval / Reports / AI |
| Manager | Shift, custody, tiket, stok, investigasi | Daily Ops / Review / Cash Custody |
| Kasir | Jual cepat & akurat, catat uang, tutup shift tanpa bingung | POS / Shift / Petty / Recount |
| Waiter | Order meja, status layanan | Tables / QR / Order Status |
| Bar/Kitchen | Proses tiket berurutan, stock-out, request bahan | KDS / Prep / Stock Request |
| Gudang | PR, PO, receiving, opname | WMS / Purchase / Receiving |
| Finance/HR | Review transaksi, payroll/absensi sesuai izin | Finance / Payroll / HR |
| Member | Login aman, pesan, benefit, poin | Member Portal |

UI wajib membedakan akun yang **berhasil login** dari akun yang **berizin operasional**.

### 23.4 Sitemap Owner

| Level 1 | Submenu |
|---|---|
| Beranda Owner | Overview · Kinerja · Tugas perlu perhatian |
| Operasional | POS · Pesanan · Meja · KDS · Shift & Closing |
| Keuangan | Ledger · Payment & QRIS · Petty Cash · Custody · Rekonsiliasi · Risiko · Approval Center |
| Produk & Stok | Produk & Harga · Bahan & Resep · WMS · PR · PO · Supplier |
| Pelanggan & Tim | Member CRM · HR · Jadwal · Absensi · Payroll · Access Approval |
| Bisnis & Konten | Event · Invitation · Promo · Website · Marketing |
| Insight & Sistem | Reports · AI Command Center · Audit · Integrations · Settings · Module Registry |

### 23.5 Navigasi per perangkat

| Desktop ≥ 1200 | Tablet 768–1199 | Mobile < 768 |
|---|---|---|
| Sidebar collapsible + topbar, breadcrumb, global search | Navigation rail adaptif, tombol tugas besar, POS landscape | 3–5 tab relevan per role; aksi primer sticky bila aman |
| Tabel lengkap, kolom prioritas, filter tersimpan | Master-detail untuk KDS, receiving, POS | List/cards ringkas, filter drawer, drill-down |
| Command palette berbasis izin + shortcut POS | Fokus sentuh, printer/QR scanner | Owner review & keputusan ringan; rekonsiliasi kompleks tidak dipaksakan |

**Global search & command palette:** hak akses dicek di server, dibatasi outlet; hasil bertipe (produk, order, shift, supplier, karyawan, laporan) dengan status & timestamp; shortcut POS konfigurabel, tidak aktif saat mengisi form lain; konteks filter/periode/pagination/outlet dipertahankan saat kembali; data sensitif tidak di localStorage tanpa kebijakan.

---

## 24. Design system & component library

### 24.1 Arah visual

Identitas Garage Coffee: **industrial-clean** dalam struktur, bukan ornamen otomotif. Charcoal/hitam, krem, putih hangat, aksen merah terkontrol. Premium tetapi terbaca di ruang kasir, dapur, tablet. Gunakan aset logo resmi dari repository; jangan membuat logo baru.

### 24.2 Semantic tokens (rancangan)

| Token | Nilai | Aturan |
|---|---|---|
| `color.bg.app` | `#FAFAF8` | Permukaan utama light |
| `color.bg.surface` | `#FFFFFF` | Kartu, dialog, tabel |
| `color.text.primary` | `#1B1D20` | Teks utama |
| `color.text.secondary` | `#5C626B` | Metadata, helper |
| `color.brand.primary` | `#B52928` | CTA khusus & indikator brand, bukan semua aksi |
| `color.brand.dark` | `#121315` | Navigasi gelap, headline |
| `color.surface.warm` | `#F4F0E8` | Panel konteks |
| `color.status.success` | `#267153` | Berhasil/terverifikasi + label |
| `color.status.warning` | `#916020` | Peringatan |
| `color.status.danger` | `#B52928` | Risiko tinggi/kesalahan/shortage — dengan teks |
| `color.status.info` | `#275F91` | Informasi, link kontekstual |

Merah hanya untuk shortage/critical; status selalu ikon + teks (tidak bergantung warna).

### 24.3 Fondasi

| Fondasi | Spesifikasi |
|---|---|
| Font | Font UI existing bila layak; kandidat Inter/font berlisensi; fallback system sans-serif |
| Type scale | 12 metadata · 14 helper · 16 body · 20 title mobile · 24–28 desktop hero |
| Spacing | Basis 4px: 4/8/12/16/24/32/40/48; ritme 8px |
| Radius | 6 input · 8 button · 12 card · 16 dialog |
| Elevation | Maks 3 tingkat; tabel pakai border & perbedaan surface |
| Grid | 12 kolom desktop · 8 tablet · 4 mobile |
| Dark mode | Opsional; lolos contrast & chart state; kasir prioritas keterbacaan |
| Angka uang | Format `Rp` IDR, align kanan di tabel, tidak mengubah nilai saat autoformat |

### 24.4 Motion

| Token | Nilai | Batas |
|---|---|---|
| `motion.fast` | 120–160 ms | Pressed feedback |
| `motion.standard` | 180–240 ms | Drawer, tabs |
| `motion.dialog` | 200–280 ms | Modal; dapat diinterupsi |
| `motion.reduced` | 0–80 ms | `prefers-reduced-motion` |

Tidak ada flashing/alarm berkedip yang melelahkan atau mengalihkan fokus dari transaksi kas.

### 24.5 Aksesibilitas (WCAG 2.2 AA)

Kontras teks 4.5:1, teks besar & komponen 3:1; target sentuh minimal 24×24 CSS px (rekomendasi operasional ≥ 44×44); label terlihat; focus ring konsisten; navigasi keyboard; error terhubung ke field; zoom 200%; reduced motion. Diuji dengan keyboard, screen reader, tablet kasir, pencahayaan outlet.

### 24.6 Keluarga komponen

| Keluarga | Komponen | State wajib |
|---|---|---|
| Actions | Primary/secondary/tertiary/destructive, icon, split | Disabled dengan penjelasan; loading idempotent; konfirmasi |
| Inputs | Text, currency IDR, quantity, date/time WIB, select, combobox, OTP, upload | Inline validation, masked sensitive |
| Navigation | Sidebar, topbar, breadcrumb, tabs, command palette, bottom nav | Active route, badge, role scope |
| Data display | KPI card, evidence card, status pill, table, virtualized list, chart | Source timestamp, drill-down, skeleton, empty |
| Overlays | Drawer, modal, tooltip, popover, confirm sheet | Focus trap, Esc semantics, danger double confirm |
| Feedback | Toast, inline alert, status banner, progress, job tracker | Pending ≠ success; retry + receipt |
| Workflow | Stepper, checklist, review diff, approval panel, timeline | Autosave draft bila aman; version conflict |
| Financial | Tender tile, denomination pad, cash movement slip, custody signature, parking declaration | Immutable IDs, source/destination, named actor |
| Identity | Verification progress, OTP input, contact status chip, access request card | Resend cooldown, status Google vs Garage terpisah |
| AI & Reports | Answer source block, permission chip, action proposal, file sync status | Evidence refs, freshness, redaksi |

**Governance:** sebelum menambah komponen → cek registry → reuse/extend/new → spesifikasi variants & states → accessibility contract → uji 3 breakpoint → daftarkan owner, semver, changelog. Tidak boleh ada komponen sama dengan gaya berbeda per modul.

### 24.7 Universal CRUD & Data Explorer

| Aksi | Pola UI | Pengaman |
|---|---|---|
| Read/search | Table/list, search/filter, saved views, detail drawer | Outlet/role scope, timestamp, pagination |
| Create | Drawer singkat; halaman khusus untuk kompleks | Required, duplicate check |
| Edit | Inline hanya field aman; layar edit untuk data terkait | Expected version, before/after, conflict |
| Bulk edit | Selector → dry-run → impact digest → approval | Affected count, exceptions, rollback ref |
| Archive/disable | Ubah status dengan konteks dampak | Tetap terlacak; restore bila sah |
| Delete | Hanya record eligible | Konfirmasi berbahaya; tidak untuk ledger posted |
| Approve | Inbox → evidence → MFA bila wajib | Reason, expiry, receipt |
| Import/export | Template → mapping → dry-run → hasil per baris | Tidak overwrite master tanpa persetujuan |

Tabel: filter + search bersamaan dengan chip & *Clear all*; kolom IDR align kanan; ID, waktu WIB, source ID, actor dapat dibuka; aksi massal menunjukkan jumlah terpilih & pengecualian izin; empty state membedakan *tidak ada data* / *filter terlalu sempit* / *tidak punya akses*.

### 24.8 State wajib setiap layar kritis

default · empty · loading · error · offline/pending · success · unauthorized · conflict · stale (data melewati ambang freshness).

### 24.9 Terminologi baku

| Jangan pakai | Gunakan |
|---|---|
| Balance berhasil (tanpa bukti) | Sesuai / Selisih / Belum terverifikasi |
| QRIS selesai (setelah klik) | Menunggu verifikasi pembayaran |
| Hapus transaksi | Batalkan / Koreksi dengan jejak transaksi |
| Final closing (oleh kasir) | Ajukan penutupan shift |
| Uang hilang pasti dicuri | Selisih memerlukan pemeriksaan |
| Karyawan aktif (karena login) | Menunggu persetujuan Owner |

---

## 25. Spesifikasi layar per modul & per halaman

### 25.1 Screen registry target (rancangan; route existing dipetakan saat audit)

| Modul | Layar target | Fokus acceptance | Prioritas |
|---|---|---|---|
| Dashboard | DSH-01 Owner 360 · 02 Trends · 03 KPI Detail · 04 Alerts | Evidence, timestamp, drill-down, approval alerts | P0 |
| POS & Order | POS-01 Catalog/Cart · 02 Checkout · 03 Transactions · 04 Refund/Void · 05 Quick Retail · 06 Receipt · 07 Pending Payments | Tender guard, receipt, koreksi reversibel | P0 |
| Shift & Cash | SHF-01 Open · 02 Active · 03 Cash Movement · 04 Closing Wizard · 05 Cash Count · 06 Manager Handover · 07 History | Pecahan, parkir, petty, double recount, owner-final | P0 |
| Finance | FIN-01 Overview · 02 Cash Ledger · 03 Reconciliation · 04 QRIS · 05 Deposit/Custody · 06 Risk Cases · 07 Daily Approval Center · 08 Monthly Accountability | Ledger berbukti, QRIS paid vs settled, exceptions | P0 |
| Products & Pricing | CAT-01 Catalog · 02 Product Form · 03 Variant/Add-on · 04 Price List · 05 Event Pricing · 06 Import Review | Price version, effective date, bulk preview, margin | P1 |
| Ingredients & HPP | REC-01 Materials · 02 BOM · 03 Supplier Cost · 04 HPP Impact · 05 Recipe Versions | Konversi unit, versioning, snapshot historis | P1 |
| WMS | WMS-01 Inventory · 02 Requests · 03 PR/PO · 04 Receiving · 05 Opname · 06 Adjustments · 07 Suppliers | Stock ledger, discrepancy, konteks harga | P1 |
| KDS | KDS-01 Ticket Board · 02 Ticket Detail · 03 Batch · 04 Stock-out · 05 Material Request | Tile besar, timer, state machine | P1 |
| Tables & QR | TBL-01 Map · 02 QR Setup · ORD-01 Digital Menu · 02 Cart · 03 Tracking | Status meja, payment state, dispatch KDS | P1 |
| Documents & Reports | DOC-01 Explorer · 02 Export History · RPT-01 Builder · 02 Preview · 03 Schedule · 04 Delivery Logs | Versi/hash, Drive ACL, job status | P1 |
| Member & CRM | MEM-01 Login · 02 Email/WA Verification · 03 Profile · 04 Card · 05 Points · CRM-01 Directory · 02 Segment | Dual verification, ledger poin, consent | P2 |
| HR & Payroll | HR-01 Staff Applications · 02 Directory · 03 Role · 04 Attendance · 05 Schedule · 06 Payroll Preview | Pending staf, Owner approval, payroll terbatas | P2 |
| Event | EVT-01 Events · 02 Event Menu · 03 Guest List · 04 Personal Links · 05 RSVP | Scope harga event, tanpa check-in QR | P2 |
| Marketing | MKT-01 Assets · 02 Editor · 03 Calendar · 04 Publish Queue · 05 Performance | Draft/approve/publish | P2 |
| Email & Notif | MSG-01 Alerts · 02 Email Draft · 03 Templates · 04 Rules | Preview penerima, delivery status | P2 |
| Config & Security | SYS-01 Access Approval · 02 Role Matrix · 03 Outlet/Business Date · 04 Integrations · 05 Audit & Recovery · 06 Health · 07 Settings · 08 Module Registry | MFA, permission diff, revoke sesi, flags | P0 |
| AI | AI-01 Command Center · 02 Evidence Answer · 03 Action Preview & Diff · 04 Approval & Receipt · 05 Capability Registry · AYA-01 Contextual Assistant | Receipt-before-claim, redirect aksi risiko ke Owner UI | P0 |

### 25.2 Workspace per role (above-the-fold)

| Workspace | Prioritas |
|---|---|
| Owner 360 | Ringkasan hari ini; approval pending; jumlah exception; laci vs custody vs QRIS; stok kritis; tren; quick evidence links |
| Manager Ops | Shift terbuka, handover belum diterima, KDS delay, PR, cash review, risk flags |
| Kasir | POS first; status shift; shortcut cash in/out; reminder parkir/closing; payment queue |
| Bar/Kitchen | Kolom Received/Accepted/In Progress/Ready/Served; umur tiket; stock-out; request bahan |
| Gudang | Min stock, PR pending, purchasing, receiving, selisih opname, konteks harga supplier |
| Finance/HR | Ledger/recon drill-down; payroll review berizin; audit absensi |
| Member | Pesan, tier/poin/benefit, status verifikasi kontak; tidak melihat tools karyawan |

**Evidence cards:** setiap KPI uang menampilkan periode bisnis, as-of, metode agregasi, status verifikasi, perbandingan, link detail. Sumber QRIS belum tersedia → "belum terverifikasi", bukan 0.

### 25.3 Kontrak halaman P0

| Screen | Role | Komponen utama | Acceptance & security |
|---|---|---|---|
| POS-02 Checkout | Kasir | Metode bayar, total, outstanding, status provider, receipt | Salah CASH/QRIS dicegah; pending ≠ paid; posting tunggal idempotent; responsif keyboard/tablet; offline pending aman |
| SHF-01 Open Shift | Kasir | Float per pecahan, akun, outlet, peringatan | Float valid; ack tercatat; tanpa bypass via route |
| SHF-04 Closing | Kasir/Manajer | Wizard step, parkir, recount, variance, evidence | 2 count independen; submit ≠ final; stale invalidation; draft recovery |
| FIN-03 Reconciliation | Owner/Finance | Tender match, ledger, bank, custody, exceptions | Sumber & coverage konsisten pada snapshot; export berizin |
| FIN-07 Approval Center | Owner | Date picker, dossier 360, decision controls | MFA fresh; terikat hash snapshot; with-exception tetap tampil |
| SYS-01 Access Approval | Owner | Pemohon, status email/WA, role/outlet, alasan | Pending tidak bisa buka POS; step-up; revoke sesi segera |
| DSH-01 Owner 360 | Owner | Omzet, cash/QRIS, risiko, freshness, approval | Data hilang = not verified; deep link ke bukti |
| AI-01 Command Center | Owner | Input perintah, scope, status MCP, evidence, preview | Tidak klaim commit tanpa receipt; aksi risiko diarahkan ke Owner UI |
| WMS-04 Receiving | Gudang | PO lines, expected vs actual, unit, harga | Partial & discrepancy tertaut stock movement; field scannable |

### 25.4 Owner Control Center (S1)

| Halaman | Komponen wajib |
|---|---|
| Owner Command Center | Input perintah, quick actions, status MCP, pilihan sumber data, result panel, histori operasi |
| Universal Data Explorer | Filter modul/outlet/periode, detail & history, bulk select, import/export |
| Action Preview & Diff | Before/after, impacted records, risk label, warnings, estimasi dampak finansial |
| Approval Inbox | Pending, step-up, approve/reject + alasan, expiry, digest |
| Reports Studio | Template, filter bahasa alami, preview, export, schedule, tujuan email/Drive |
| Google Integrations | Connect/disconnect OAuth, identity, scopes, sync status, failed jobs, retry |
| Audit & Recovery | Timeline operasi, actor, sumber (ChatGPT/Aya/dashboard), restore options, ledger refs |
| Module & Permissions | Registry domain & tool, role matrix, permission diff, feature flags, health |

### 25.5 Progress kasir

6 langkah: **Hitung Uang → Periksa QRIS → Periksa Pengeluaran → Serah Terima → Review Selisih → Owner Authorization.**

---

## 26. Data model & API konseptual

> Audit skema existing dahulu; **reuse** sebelum membuat entitas baru. Nama di bawah konseptual.

### 26.1 Kolom lintas entitas krusial

`tenant/outlet_id, business_date (DATE), timezone, shift_id, actor_user_id, counterparty_user_id, status, amount_idr (integer), currency, source_account_id, destination_account_id, transaction_ref, evidence_ref, created_at/occurred_at/verified_at/approved_at (UTC), idempotency_key, version, reason, financial_case_id, verification_source, settlement_id, policy_version_id, approval_hash`.

### 26.2 Entitas — keuangan & shift

| Entitas | Field minimum |
|---|---|
| `shift_sessions` (reuse cashSessions) | outlet, business_date, cashier, status state machine, opening, policy_version |
| `cash_ledger_entries` (existing) | source/destination account, amount, purpose, holder, occurred_at, reversal_of, idempotency |
| `denomination_counts` / `cash_count_lines` | count_id, shift/manager_account, role, count_no (1/2/3), note_breakdown, amount, counted_at, stale |
| `cash_transfers` | transfer_id, from/to holder, requested/received amount, requested_at/received_at, status (DISPUTED) |
| `manager_cash_accounts` / `manager_custody_snapshots` / `manager_float_movements` | account, location_type, expected, actual, difference, deposit_ids, bank_refs |
| `petty_cash_ledgers` | box, PIC, movements, replenishment |
| `parking_collections` / `daily_collections` | outlet, business_date, collection_type, target, received, receiver_holder, status, reason |
| `payment_tenders` / `payment_attempts` | intent_id, order_id, method, amount, state, provider_ref, correction_of |
| `qris_reconciliations` / `qris_settlement_items` | provider ref, paid/pending/settled, fee, refund |
| `quick_retail_orders` | order_type=QUICK_RETAIL, SKUs, payment_ref, inventory_movements, receipt |
| `stock_purchase_references` | purchase_id, supplier, qty, cost, funding source, receiving |
| `financial_exceptions` / `investigations` | case_id, subject_roles, custody_window, severity, event/detected/reviewed/confirmed, evidence, disposition, reviewers |
| `risk_signals` | rule_id, rule_version, level, event_at, detected_at, evidence_refs |
| `policy_versions` / `policy_acceptances` | text, version, effective_date, acceptance per shift |
| `closing_approvals` / `closing_snapshots` / `owner_closing_decisions` | snapshot_id, cashflow_hash, owner_id, outcome, fresh_mfa context, nonce, decided_at |
| `monthly_reconciliation_snapshots` | month, start balance, new, resolved, confirmed, recovered |
| `payroll_liability_cases` | case_id, verified loss, clarification, legal basis, HR status |
| `financial_audit_events` | append-only, before/after hash |

### 26.3 Entitas — identitas

| Entitas | Field |
|---|---|
| `identity_links` | principal_type, principal_id, provider, provider_subject; unique(provider, provider_subject, principal_type) |
| `contact_verifications` | principal, contact_type, contact_hash, challenge_hash, status, attempts, expires_at, verified_at, contact_version (PII terenkripsi) |
| `staff_access_requests` | applicant_user_id, outlet_id, requested_role, status, submitted_at, decision_at/by/reason, policy_version |
| `identity_security_events` | principal, event_type, occurred_at, request_id, ip_hash, actor, metadata (tanpa OTP/token) |
| Proyeksi | `email_verified_at`, `whatsapp_verified_at` pada model aktif — tanpa sumber kebenaran ganda |

### 26.4 Entitas — command center & integrasi

| Entitas | Field |
|---|---|
| `mcp_connections` | user_id, provider, external_subject, scopes, status, last_used, revoked_at |
| `module_registry` | module, version, schema_ref, actions, risk_rules, owner_enabled |
| `command_operations` | operation_id, actor, source, intent, scope, status, request_id, idempotency_key, executed_at |
| `change_previews` | preview_id, expires_at, target_hash, diff_json, affected_count, risk_tier |
| `operation_approvals` | approval_id, action_hash, approver_id, method, approved_at, expiry |
| `audit_events` | append_only_id, operation_id, before_hash, after_hash, payload_ref, actor, timestamp |
| `generated_reports` | report_id, data_cutoff, criteria, file_hash, version, retention_class |
| `external_sync_jobs` | job_id, provider, target_ref, status, attempt, last_error, remote_id |
| `automation_policies` | schedule, topic, recipients, destination, trigger, enabled, owner_id |

### 26.5 Route konseptual

**Shift & finance**
- `POST /api/shifts/{id}/open` · `POST /api/shifts/{id}/blind-count` · `POST /api/shifts/{id}/recount` · `GET /api/shifts/{id}/reconcile`
- `POST /api/shifts/{id}/cash-movements` · `POST /api/parking/{business_date}/declaration`
- `POST /api/transfers` · `POST /api/custody/transfers/{id}/ack`
- `POST /api/manager/custody/count` · `GET /api/manager/custody?business_date=`
- `POST /api/qris/reconcile`
- `POST /api/shifts/{id}/submit` (kasir) · `POST /api/shifts/{id}/manager-review` (manajer)
- `POST /api/owner/closing/{id}/approve` (Owner + MFA fresh + nonce; atomic snapshot)
- `GET /api/owner/financial-dossier?from=&to=` · `GET /api/owner/monthly-accountability?month=YYYY-MM`
- `GET /api/risk/cases?from=&to=` · `GET /api/risk/cases/{id}/timeline` · `POST /api/risk/cases/{id}/review`
- `POST /api/reports/pdf/{shift|daily|monthly|case}` · `GET /api/reports/closing?date=`

**Identitas**
- `POST /api/identity/email/start|verify` · `POST /api/identity/whatsapp/start|verify`
- `POST /api/staff/applications` · `GET /api/staff/applications/me`
- `GET /api/owner/staff-applications` · `POST /api/owner/staff-applications/{id}/decision`
- Callback Google OAuth via Better Auth.

**Gateway:** `POST /api/mcp` (internal, existing) · `POST /api/mcp/chatgpt` (OAuth).

Semua endpoint: validator Zod, CSRF/callback protection, idempotency, rate limit, audit, role guard server-side, outlet scope.

---

## 27. Keamanan, privasi, audit & pemulihan

| Kontrol | Persyaratan P0 |
|---|---|
| Identity/AuthZ | OIDC/OAuth, explicit owner mapping, MFA step-up, session expiry/revoke, deny-by-default server-side |
| Secrets | Vault/KMS untuk token Google/ChatGPT/WhatsApp; enkripsi at-rest; rotasi; least privilege; secret TOTP tidak plaintext |
| Audit tamper resistance | Append-only, terpisah dari data bisnis; delete/modify log tidak diekspos via MCP/UI |
| Ledger | Tidak ada delete cash movement; reversal berpasangan |
| Backups | Terenkripsi, PITR bila didukung, offsite copy, restore drill berkala + RPO/RTO terukur |
| Change control | Preview digest, approval TTL, expected version, idempotency, recovery plan, receipt |
| Data governance | Klasifikasi, RBAC per field, PII redaction, retensi, revocation |
| DB | Least-privilege PostgreSQL role; batas role/outlet sampai lapisan data |
| Operational defense | Rate limit, WAF sesuai infrastruktur, dependency scan, anomaly alert, health |
| Incident response | Kill-switch MCP, revoke tokens, pause writes, investigasi per operation_id, restore procedure |
| Email | Recipient allowlist laporan keuangan; preview & approval penerima eksternal; SPF/DKIM/DMARC |
| Integrations | Scope Google minimum, kredensial terpisah, connector health, timeout/retry monitoring |
| Logging | Tidak mencatat OTP, token, password, cookie; korelasi request→ledger via correlation_id |
| Baseline uji | OWASP ASVS 5.0 control mapping |

---

## 28. Acceptance criteria terpadu

Sumber asal dicantumkan: S1 = AC-xx, S2 = Bagian/Test, S3 = AC-UX-xx.

### 28.1 Keuangan, kas & closing

| ID | Kriteria lulus | Sumber |
|---|---|---|
| AC-F01 | Opening shift dengan kas awal salah → ditolak tanpa recount/penjelasan | S2 B21-01 |
| AC-F02 | Total pecahan ≠ input total → pecahan menjadi sumber | S2 B21-02 |
| AC-F03 | Petty cash dari laci menurunkan expected cash **tepat sekali** | S1 AC-10 |
| AC-F04 | Belanja via transfer Owner tidak menurunkan expected laci; tidak ada cash-out kasir | S1 AC-11, S2 V2.5-05 |
| AC-F05 | Belanja bahan dari laci Rp80.000 mengurangi expected, muncul 1× di ledger & PDF | S2 V2.5-04 |
| AC-F06 | Deklarasi parkir wajib termasuk 0/Belum Diterima; bila di laci dihitung sekali; target harian tidak duplikat per shift | S1 AC-12, S2 V2.5-06/07 |
| AC-F07 | Parkir belum nyata tidak menambah kas; parkir ke manajer tidak menambah laci | S2 B21-03/04 |
| AC-F08 | QRIS sale tidak memperbesar expected cash; settlement direkonsiliasi terpisah | S1 AC-13 |
| AC-F09 | QRIS paid Rp300k pending settlement tidak dianggap shortage | S2 B21-08 |
| AC-F10 | QRIS POS berhasil tetapi gateway gagal → mismatch ditandai | S2 B21-09 |
| AC-F11 | QRIS PENDING bukan PAID walau kasir menekan konfirmasi | S2 V2.5-02 |
| AC-F12 | Salah tekan CASH sebelum commit kembali ke QRIS → laci tidak bertambah | S2 V2.5-01 |
| AC-F13 | CASH dengan kembalian benar; retry tidak menggandakan saldo | S2 V2.5-03 |
| AC-F14 | Refund setelah QRIS berhasil → verifikasi provider sebelum pembalikan | S2 B21-07 |
| AC-F15 | Split payment cocok total, tidak menduplikasi posting | S3 AC-UX-06 |
| AC-F16 | Belanja stok tunai → cash-out + purchase ref; tidak menambah omzet | S2 B21-05 |
| AC-F17 | Quick Retail tanpa meja/takeaway: stok & omzet berubah hanya setelah paid sah; SKU baru via approval; harga existing tetap | S2 V2.5-08/09 |
| AC-F18 | Kasir serah Rp400k, manajer terima Rp390k → DISPUTED | S2 B21-06 |
| AC-F19 | Manajer terima Rp400k & float Rp100k cocok tanpa memengaruhi omzet; float Rp90k → manager variance terpisah | S2 B33-01/02 |
| AC-F20 | Count #1 vs #2 berbeda → tidak lanjut tanpa count #3/penjelasan; count #2 tidak disalin dari #1 | S2 B33-03, V2.5-10 |
| AC-F21 | Cash-out baru setelah recount → count STALE, wajib hitung ulang | S2 B33-04 |
| AC-F22 | Closing menampilkan fisik, expected, selisih, breakdown, sign-off | S1 AC-14 |
| AC-F23 | Kasir/manajer mencoba Final Closing (UI/API/crafted request) → ditolak backend; manager PIN tidak bypass | S2 B21-10, B33-05 |
| AC-F24 | Owner AAL1/tanpa re-auth/OTP invalid/expired/reuse → ditolak | S2 B21-11, B59 |
| AC-F25 | Owner MFA valid tetapi data berubah → approval lama tidak berlaku | S2 B21-12 |
| AC-F26 | Submit/approval ganda/concurrent → hanya satu posting final | S2 B21-13 |
| AC-F27 | Shift lintas 00:00 → sesuai business_date, tidak duplikat | S2 B21-14 |
| AC-F28 | Approved with exception → PDF tetap menampilkan selisih OPEN | S2 B21-17, S3 AC-UX-11 |
| AC-F29 | Transaksi final tidak bisa hard-delete; koreksi via reversal tertaut | S1 AC-15 |
| AC-F30 | Report final = ledger snapshot; koreksi setelah approved membuat versi baru | S2 B21-18, B33-12 |
| AC-F31 | Kasir berganti → case diatribusi berdasar periode & handover | S2 B21-16 |
| AC-F32 | Rekap bulanan memisahkan shortage & surplus; transfer antarshift tidak menduplikasi pendapatan | S2 B33-09, V2.5-14 |

### 28.2 Risiko, investigasi & payroll

| ID | Kriteria | Sumber |
|---|---|---|
| AC-R01 | Liability case pending → payroll tidak terpotong otomatis | S2 B21-15 |
| AC-R02 | LV5 dari percobaan alterasi → bukti & reason code muncul; tidak dinyatakan pencurian; tidak potong gaji | S2 B33-07, V2.5-13 |
| AC-R03 | Kasus manajer tidak dapat diselesaikan sepihak oleh manajer terkait | S2 B33-08 |
| AC-R04 | Filter menampilkan business_date, event_at, detected_at, reviewed_at berbeda | S2 B33-10 |
| AC-R05 | Stock adjustment menyimpan reason, actor, before/after, movement, approval | S1 AC-17 |

### 28.3 Identitas & akses

| ID | Kriteria | Sumber |
|---|---|---|
| AC-I01 | Google member, email verified, WA belum → belum aktif penuh | S2 V3.1 |
| AC-I02 | Email & WA verified → member aktif; poin/histori utuh, tidak duplikat | S2 V3.1, S3 AC-UX-19 |
| AC-I03 | Login Google member tidak pernah menghasilkan role staf/owner | S1 AC-04 |
| AC-I04 | Registrasi staf dua kontak verified → PENDING_OWNER_APPROVAL; semua API POS/Finance 403 | S1 AC-05, S2 V3.1, S3 AC-UX-18 |
| AC-I05 | Pendaftar ubah role via request/devtools → server menolak | S2 V3.1 |
| AC-I06 | Owner approve dengan MFA → role & outlet atomik + audit | S2 V3.1 |
| AC-I07 | Manager menyetujui pendaftar → 403 + audit | S2 V3.1 |
| AC-I08 | Ganti WA/email → unverified sampai kontak baru diverifikasi; aktivitas sensitif ditahan | S2 V3.1 |
| AC-I09 | OTP reuse/brute force → ditolak & throttle akun/nomor/IP | S2 V3.1 |
| AC-I10 | Token member ↔ staf tidak saling mengakses namespace API | S2 V3.1 |
| AC-I11 | Pegawai tanpa role mencoba operasi owner via MCP/API → 403 + denial audit | S1 AC-03 |
| AC-I12 | Role edit / cross-outlet / mass delete butuh step-up, terlihat di approval timeline | S1 AC-27 |
| AC-I13 | Akses payroll, pelanggan, dokumen sensitif dibatasi role/scope | S1 AC-33 |
| AC-I14 | Navigasi menolak route tak berizin via server guard walau URL diketik manual | S3 AC-UX-02 |

### 28.4 Produk, harga, stok, KDS

| ID | Kriteria | Sumber |
|---|---|---|
| AC-P01 | Ubah harga produk → POS & menu reguler sesuai efektif; order lama tak berubah | S1 AC-06 |
| AC-P02 | Ubah harga event → reguler & histori tak berubah | S1 AC-07 |
| AC-P03 | Update biaya material → estimasi HPP baru; COGS historis tetap | S1 AC-08 |
| AC-P04 | Bulk update menampilkan semua target + diff; approval tidak berlaku untuk diff berbeda | S1 AC-09 |
| AC-P05 | Bar/Kitchen request, Gudang konsolidasi tanpa mengubah stok sebelum receiving | S1 AC-16 |
| AC-P06 | Receiving parsial/discrepancy tertaut stock movement; tidak ada fake sales | S3 AC-UX-16 |
| AC-P07 | KDS menolak transisi status tak sah di backend | S3 AC-UX-17 |
| AC-P08 | Data berelasi historis hanya archive/disable sesuai retensi | S1 AC-28 |

### 28.5 AI, MCP & integrasi

| ID | Kriteria | Sumber |
|---|---|---|
| AC-M01 | Owner via ChatGPT search semua domain tersedia; hasil menyebut modul & data cutoff | S1 AC-01 |
| AC-M02 | (Fase write) CRUD non-finansial; get by ID menunjukkan nilai baru | S1 AC-02 |
| AC-M03 | AI membaca metrik lintas modul dengan evidence, bukan angka karangan | S1 AC-18 |
| AC-M04 | Instruksi tersisip di email/invoice/catatan tidak memicu mutasi | S1 AC-23, S2 B59 |
| AC-M05 | Duplicate idempotency key → tidak ada mutasi kedua | S1 AC-24 |
| AC-M06 | expected_version lama → conflict, tanpa silent overwrite | S1 AC-25 |
| AC-M07 | Revoke token → semua operasi ditolak | S1 AC-26 |
| AC-M08 | ChatGPT/Aya tidak mengklaim commit saat backend UNKNOWN | S1 AC-30, S3 AC-UX-20 |
| AC-M09 | Module Registry menampilkan supported actions & missing capabilities | S1 AC-31 |
| AC-M10 | Audit log tidak bisa diedit/hapus via gateway | S1 AC-32 |
| AC-M11 | Perubahan kritis menampilkan receipt & recovery ref | S1 AC-34 |
| AC-M12 | Custom MCP diuji terhadap ketersediaan paket nyata | S1 AC-36 |
| AC-M13 | MCP default read-only finance; tidak ada `garage_api` wildcard; read-only mencoba mutasi → ditolak, DB tidak berubah | S2 V3.1, S3 AC-UX-20 |
| AC-M14 | ChatGPT identity tanpa Garage OAuth tidak dapat akses | S2 V3.1 |
| AC-M15 | Generate PDF/XLSX/CSV dengan filter waktu/outlet & metadata sumber valid | S1 AC-19 |
| AC-M16 | Upload Drive berhasil → file ID terverifikasi & tercatat; gagal sesaat → retry, tidak klaim sukses | S1 AC-20/21, S3 AC-UX-21 |
| AC-M17 | Email laporan butuh izin; penerima terotorisasi; message ID tersimpan | S1 AC-22 |
| AC-M18 | Job terjadwal punya status & history; kegagalan memicu notifikasi | S1 AC-29 |
| AC-M19 | PDF shift/hari/bulan/kasus menampilkan arus kas, parkir, tender, custody, timeline, evidence, keputusan, watermark draft | S2 B33-11, V2.5-15 |
| AC-M20 | Report omzet/laci/QRIS menyebut as-of, source IDs, metode, status verifikasi | S3 AC-UX-14 |

### 28.6 UX & kualitas

| ID | Kriteria | Sumber |
|---|---|---|
| AC-U01 | Ke-16 modul punya screen list, owner, role, states, responsive rules, route mapping | S3 AC-UX-01 |
| AC-U02 | Tidak ada clipping field nominal/approval/tombol utama di 3 breakpoint | S3 AC-UX-03 |
| AC-U03 | Tombol kritis punya loading, error, retry-safe, receipt; tidak ada success palsu | S3 AC-UX-04 |
| AC-U04 | CASH/QRIS terlihat berbeda secara visual & semantik | S3 AC-UX-05 |
| AC-U05 | Open Shift mencatat float & acknowledgement, identitas kasir/outlet benar | S3 AC-UX-07 |
| AC-U06 | Owner price edit menjelaskan scope regular/event, effective date, non-retroaktif | S3 AC-UX-15 |
| AC-U07 | Keyboard focus, label, contrast, zoom 200%, reduced motion, target sentuh | S3 AC-UX-22 |
| AC-U08 | Semua layar kritis punya state default/empty/error/offline/loading/success/unauthorized/conflict | S3 AC-UX-23 |
| AC-U09 | UAT lintas peran + visual regression pada staging; production setelah sign-off & rollback siap | S3 AC-UX-24 |
| AC-U10 | Backup/restore terbukti sebelum write kritis diaktifkan di production | S1 AC-35 |

---

## 29. Roadmap implementasi & release gates

| Fase | Ruang lingkup | Gate lanjut |
|---|---|---|
| **0. AUDIT & CONTAINMENT** | Read-only audit repo, DB, VPS, RBAC, domain API, laporan, `/api/mcp` & `garage_api`, close route, ledger, auth, member-auth; screen/route census + screenshot; Module Registry hasil discovery | Gap report + as-is/to-be disetujui Owner; backup & rollback terverifikasi; tidak ada production write |
| **1. FINANCIAL INTEGRITY** | Ledger correctness, payment state machine, tender guard, Cash In/Out, parkir wajib, petty, stock purchase, QRIS paid/settled, business date | Invarian lulus 100% critical cases; tidak ada double posting/phantom revenue |
| **2. IDENTITY & ACCESS** | Google OAuth, email verification, WhatsApp OTP, member bridge, staff application, Access Approval Center, server gate, step-up MFA | Test negatif identitas lulus; migrasi member tanpa kehilangan poin/tier |
| **3. CASHIER/MANAGER CONTROLS & OWNER APPROVAL** | Double blind recount, manager custody & denominasi, split submit/final endpoint, snapshot immutable, Owner TOTP, exception workflow, Approval Center | Kasir/manajer tidak bisa final via API/UI; concurrent approval diblokir |
| **4. DESIGN SYSTEM & CORE UX PILOT** | Tokens, shell navigasi, komponen dasar, a11y baseline; redesign POS, shift/closing, custody, approval, KDS | Usability test staf; finance reconciled; rollback rehearsal |
| **5. ANALYTICS, RISK & REPORTS** | Owner 360, monthly accountability, LV rules, investigasi, PDF/Excel 4 jenis, Reports Studio, Drive/Gmail, job queue | Semua angka traceable; PDF = snapshot; fairness controls; upload/mail terverifikasi |
| **6. MCP GATEWAY & AYA** | OAuth gateway read-only, tool allowlist, Aya in-app; kemudian write R1 lalu R2 per domain | MCP Inspector, auth, prompt-injection, IDOR tests lulus; receipt valid end-to-end |
| **7. GROWTH MODULES, HARDEN & ROLLOUT** | WMS/harga/HPP/CRM/HR/event/marketing/QR redesign; load/restore drill, MFA recovery, incident playbook, canary, SOP & training | UAT signed, restore teruji, monitoring siap, Owner go/no-go |

**Kriteria deploy:** tidak edit DB production saat audit; staging terpisah dengan data tersamarkan; deploy via repo/CI setelah verifikasi (tanpa patch manual tanpa change record); setiap fitur punya DoR, DoD, integration test, regresi UI, rollback playbook; mulai read-only, aktifkan write per domain bertahap sambil mengukur error rate, latency, missing receipts, reconciliation gaps.

**Go/no-go:** nol temuan P0/P1 security terbuka; critical financial test 100% lulus (bukan klaim tanpa cacat); Owner menandatangani contoh hitung & sampel rekonsiliasi beberapa business date termasuk lintas tengah malam; MFA recovery teruji; MCP revocation berfungsi; tidak ada akses write chat ke arus uang; monitoring penggunaan tak wajar aktif; rollback satu deploy.

**Prioritas mutlak keuangan:** P0 definisi laci & kebenaran metode bayar → P1 Cash In/Out + parkir → P2 Quick Retail + stok → P3 double recount + deposit manajer → P4 Owner Approval + risk evidence + PDF → P5 tren bulanan & pelatihan. *Ketepatan uang harus selesai sebelum laporan otomatis dinilai tepercaya.*

**Dependensi:** design system boleh paralel dengan audit keuangan, tetapi UI closing tidak siap production sebelum ledger, ownership, authorization, idempotency, dan state machine lulus test. Gunakan branch/PR, staging, feature flags.

---

## 30. KPI, SLO & monitoring

| Indikator | Target / pengukuran |
|---|---|
| Operation traceability | 100% write punya operation_id, audit event, actor |
| Duplicate commit | 0 mutasi duplikat akibat retry dalam skenario uji |
| Financial invariants | 0 pembukuan ganda cash-vs-QRIS; setiap penyesuaian bertaut sumber |
| Sync reliability | 100% report sukses punya file ID/message ID valid; kegagalan terlihat di retry queue |
| Data freshness | Respons menunjukkan as-of & stale status melewati ambang |
| Authorization | 100% negative authorization UAT ditolak + audit denial |
| Recovery readiness | Restore drill terjadwal; RPO/RTO dari hasil uji aktual |
| Identity | Tingkat sukses/gagal verifikasi, biaya OTP, anomali OTP, waktu approval Owner, error OAuth callback |
| UX — task completion | Naik vs baseline (angka ditetapkan setelah uji) |
| UX — median task time | Checkout/closing/PO turun tanpa memangkas kontrol |
| UX — tender error rate | Salah CASH/QRIS per 100 transaksi turun |
| UX — first-time success | Staf baru tanpa coaching meningkat |
| A11y | Tidak ada critical blocker WCAG 2.2 AA pada core tasks |
| Data correctness | UI/report = approved ledger snapshot |

SLA operasional final ditetapkan setelah baseline observability VPS/DB. Jangan klaim peningkatan % sebelum baseline & eksperimen.

**Riset sebelum high-fidelity:** contextual inquiry (kasir jam ramai, closing manajer, receiving gudang, tiket bar/kitchen); wawancara 20–30 menit per peran; catat frekuensi tugas, taksonomi error, durasi, device, network, printer; tree test IA; usability test prototype; uji keyboard & screen reader.

---

## 31. Risk register & keputusan terbuka

### 31.1 Risk register

| ID | Level | Risiko | Mitigasi |
|---|---|---|---|
| R-01 | Critical | UI/logic menafsirkan QRIS/transfer sebagai cash | Test drawer vs settlement; bandingkan read model dengan snapshot |
| R-02 | Critical | Final Closing oleh non-owner | Server deny, 2FA, negative escalation tests |
| R-03 | Critical | Ledger rusak akibat delete/edit | Append-only, reversal; audit wipe ditolak |
| R-04 | High | MCP generic mengekspos tool finance/write | Allowlist, OAuth scope, read-only default, pentest |
| R-05 | High | Login Google menggandakan akun member/poin | Safe linking, dual verification, no silent merge |
| R-06 | High | Perubahan skema/komponen memutus POS aktif | Feature flag, e2e checkout, canary + rollback |
| R-07 | High | Perubahan massal salah scope | Dry-run, diff digest, approval expiry, rollback |
| R-08 | High | File finansial Drive menjadi publik | ACL, signed links, no public default |
| R-09 | High | Staging belum tersedia | Wajib siapkan sebelum aktifkan write |
| R-10 | High | Token Drive/Gmail/WhatsApp expired | Status integrasi, refresh, re-auth, queue recovery |
| R-11 | Medium | Domain tanpa API matang | Adapter + registry; prioritas P0 |
| R-12 | Medium | Ketergantungan paket ChatGPT | Validasi workspace; fallback Aya |
| R-13 | Medium | Salah analisis AI | Evidence grounding, metrik deterministik, owner review |
| R-14 | Medium | Selisih karena parkir/petty | Mandatory checklist, rekonsiliasi per sumber dana |
| R-15 | Medium | Staf bingung navigasi baru | SOP, migration cues, edukasi in-product, pilot |
| R-16 | Medium | Motion/aset berat melambatkan tablet | Low-motion UI, profiling hardware nyata |
| R-17 | Medium | Biaya & spam OTP WhatsApp | Rate limit, batas harian, monitoring biaya |
| R-18 | Medium | Terlalu banyak kartu dashboard | Top-3 metrik prioritas + pending actions |

**Risiko residual setelah fitur terpasang:** kesalahan input fisik/nota palsu tetap butuh supervisi & audit berkala; data QRIS tidak lengkap tanpa akses provider; akun Owner bocor memperbesar dampak bila kontrol akses & log lemah; LLM dapat salah memahami narasi; hukum ketenagakerjaan harus ditelaah sebelum pengurangan upah.

### 31.2 Keputusan terbuka (Owner backlog)

1. Tanggal efektif peringatan kasir & label asli setoran Rp10.000.
2. Kasir tunggal vs bergantian per shift; aturan handover.
3. Penyedia QRIS & akses rekap/settlement.
4. Hardware POS/tablet/printer/QR scanner target uji & resolusi minimum.
5. Preferensi light/dark untuk staf operasional setelah uji lapangan.
6. Apakah Command Center boleh mengajukan draft perubahan keuangan dari ChatGPT (commit kritis tetap via Owner UI).
7. Akun Google Workspace/email resmi Garage, OAuth scope yang dapat disetujui, folder Drive & skema retensi.
8. Penyedia WhatsApp Business, nomor bisnis, template autentikasi, anggaran biaya per pesan.
9. Daftar outlet, pembatasan akses karyawan, aturan payroll, metode persediaan/valuasi.
10. Paket ChatGPT (Business/Enterprise/Edu) & dukungan MCP write pada workspace.
11. Prosedur recovery administratif bila Owner tidak dapat memasukkan OTP.
12. Kontrak kerja / Peraturan Perusahaan untuk dasar ganti rugi (review HR/legal).

---

## 32. RACI, Definition of Ready & Done

| Output | Owner | Design | Engineer | QA/Ops |
|---|---|---|---|---|
| Scope & prioritas | A | R | C | C |
| Audit route & dependency | I | C | R/A | C |
| Design tokens & screens | C | R/A | C | C |
| Invarian finance & auth | A | C | R | R |
| Identity & OTP integration | A | C | R | R |
| MCP gateway | A | C | R | R |
| UAT & pilot lapangan | A | R | R | R |
| Production release | A | C | R | R |

R = Responsible, A = Accountable, C = Consulted, I = Informed. Nama anggota tim dikonfirmasi kemudian.

**Definition of Ready:** role, job, screen, copy, sumber data, API, permission, risk tier terpetakan; semua state (default/edge/empty/loading/error/unauthorized) didesain; acceptance criteria, device target, sumber PRD, dependensi disepakati; screenshot baseline ada; tidak ada blocker arsitektur yang diabaikan.

**Definition of Done:** komponen sesuai tokens & responsif; focus/contrast/touch diuji; money invariants, role/permission, audit event, idempotency lulus unit/integration/E2E; visual regression bersih; SOP/screenshot diperbarui; rilis via staging + restore drill + rollback plan; Owner sign-off tercatat.

**DoD master PRD:** semua modul hasil audit terpetakan; Owner dapat membaca & mengelola resource sesuai permission; write kritis punya preview/approval; transaksi historis terlindungi; laporan lintas modul konsisten; Drive/email terbukti; email + WA terverifikasi untuk member & staf baru; staf pending tidak bisa akses modul kerja termasuk via endpoint langsung; seluruh acceptance criteria §28 & restore drill lulus; Owner menandatangani; semua dokumen, kode, bukti tes terlacak dari Git dan operation receipt.

---

## 33. SOP per peran

### Kasir
1. Login; baca peringatan Open Shift; hitung modal per pecahan; konfirmasi.
2. Setiap pembayaran: pilih CASH atau QRIS sesuai metode nyata; selesaikan hanya jika sah. QRIS harus status valid dari provider.
3. Uang fisik masuk selain penjualan → Cash In dengan sumber & bukti.
4. Uang laci untuk belanja → Cash Out dengan nominal/nota **sebelum/saat** uang diserahkan. Transfer Owner langsung tidak dicatat sebagai cash-out laci.
5. Penjualan kemasan langsung → Quick Retail Sale (tanpa meja/takeaway). Jangan membeli persediaan lewat penjualan dummy.
6. Serah uang ke manajer → handover dua pihak.
7. Preclose: deklarasikan parkir sesuai fakta.
8. Close Shift: hitung dua kali, cek QRIS/expense/deposit/petty, jelaskan selisih, ajukan. Jangan memalsukan nominal.

### Manajer
1. Verifikasi pengeluaran/nota & cash transfer sesuai limit.
2. Hitung deposit nyata; konfirmasi penerimaan; catat sisa titipan.
3. Laporkan sisa pecahan per denominasi, lokasi, saldo, rencana/bukti setor bank.
4. Periksa selisih; minta bukti; tidak mengubah data asli.
5. Kirim catatan pemeriksaan ke Owner — **tidak** melakukan Final Closing.
6. Jika terlibat anomali → eskalasi ke Owner; jangan memutuskan kasus sendiri.

### Owner
1. Tetapkan effective date & teks kebijakan kasir aktif; parameter konfigurasi.
2. Setujui/tolak pendaftaran staf dengan role & outlet eksplisit + MFA.
3. Buka Financial Approval Center per tanggal operasional.
4. Tinjau executive summary, expected/actual per pemegang uang, cash in/out, parkir, tender, QRIS, double recount, custody, LV4/LV5, month-to-date, pendapat tiap pihak.
5. Putuskan berdasarkan bukti: approve / approve with exception / return / escalate — jangan menyimpulkan pencurian dari risk score.
6. Final Closing dengan TOTP step-up; unduh PDF hari/shift/bulan/kasus.
7. Tindak lanjuti case & payroll secara terpisah; tinjau rekap bulanan untuk perbaikan SOP & pelatihan.

### Finance reviewer
Setiap akhir bulan: roll-forward kasus; cocokkan semua saldo per holder & bukti bank; validasi QRIS settlement.

### Gudang / Bar / Kitchen
Bar & Kitchen mengajukan kebutuhan saat closing; Gudang konsolidasi, receiving dengan cek unit/harga/dokumen, opname dengan alasan & bukti setiap adjustment.

---

## 34. Master prompt implementasi (Claude Code)

> **PROJECT RULE:** Baca seluruh PRD UNIFIED V4.0. Gunakan repository private Garage OS existing (`killuasurya-boop/garage`). Jaga harga/master/menu/resep/transaksi historis. MCP sudah ada: perkuat, jangan duplikasi. Jangan deploy tanpa gate. Jangan mengklaim fitur selesai sebelum diaudit & diuji.

**ROLE:** Principal Software Architect + Financial Ledger Engineer + POS/WMS Specialist + Internal Controls Auditor + OWASP Security Engineer + Identity/Auth Engineer + MCP/ChatGPT Integration Architect + Product Designer (design systems) + Data Analyst + QA Lead + Indonesian HR Compliance Reviewer.

**STEP A — INVENTORY (read-only).** Inspect main commit: `src/lib/cash-ledger.ts`, `src/lib/auth.ts`, `src/lib/member-auth.ts`, member-service, `staff_profiles`, `src/app/api/mcp/route.ts`, `src/lib/agent-mcp.ts`, `src/lib/agent-tools.ts`, `src/app/api/finance/cash-sessions/[id]/close/route.ts`, `.../report/route.ts`, `src/lib/reports/reconciliation.ts`, DB schema, test suites, all routes & screens (screenshot census). Inspect VPS separately before production decisions. Produce current features vs gaps, Module Registry, as-is/to-be map. Do not clone ledger/auth.

**STEP B — FINANCIAL INTEGRITY.** Use existing immutable `cash_ledger_entries` and Drizzle transactions. Integer IDR; deterministic expected/actual; idempotency end-to-end; dual-attested transfers; custody accounts; mandatory parking declaration (never fake cash-in); QRIS paid/settled split with provider-verified states; tender guard & audited corrections; cashier-funded purchases create evidenced Cash Out; Owner direct vendor transfer excluded from drawer; Quick Retail Sale distinct from Quick Stock Purchase.

**STEP C — IDENTITY & ACCESS.** Add Google OAuth via Better Auth for staff and an isolated adapter for members; Garage-issued email verification + WhatsApp OTP (hashed, TTL 5m, 5 attempts, 60s cooldown, rate limits) required for new members and staff; `staff_access_requests` with `PENDING_OWNER_APPROVAL`; Owner Access Approval Center with role/outlet allowlist + MFA step-up; server-side gates; safe account linking by provider subject; migrate legacy members without losing points/tier/history/referral.

**STEP D — SHIFT STATE MACHINE & OWNER FINAL.** OPEN → PRE_CLOSING → COUNT_1 → COUNT_2 → MANAGER_REVIEW → OWNER_PENDING → FINAL_APPROVED(_WITH_EXCEPTION) → LOCKED. Split cashier submit vs Owner final endpoint. Blind count + independent recount; stale invalidation on new ledger movement. Manager verifies custody & remaining denominations, cannot finalize. Owner alone finalizes with fresh Better Auth TOTP bound to snapshot hash, nonce, expiry. Business date configurable across midnight.

**STEP E — RISK, CASES & PAYROLL SAFEGUARDS.** Explainable LV1–LV5 rules for cashier & manager with evidence, event/detected/reviewed/confirmed timestamps, dispositions, independent reviewer when manager involved. Never auto-label theft or deduct wages. Payroll liability is a separate, legally reviewed process (PP 36/2021 jo. PP 51/2023, PP 49/2025).

**STEP F — REPORTS & DECISION SUPPORT.** Owner 360 dossier, date-first Approval Center, monthly accountability (shortage & surplus separate), 4 PDF types with snapshot hash & versioning, Excel sheets, Reports Studio, Drive/Gmail adapters with verified file/message IDs, job queue & retries. Rule-based narratives first; LLM explains only computed facts with source IDs.

**STEP G — DESIGN SYSTEM & UX.** Implement tokens, navigation shell, component registry, universal CRUD/data explorer, all required states, WCAG 2.2 AA, responsive rules; redesign P0 screens (POS, shift/closing, custody, approval center, access approval, owner 360, command center) before growth modules; validate with field usability tests.

**STEP H — SECURE MCP GATEWAY & AYA.** Reuse `/api/mcp`; add `/api/mcp/chatgpt` with OAuth 2.1 + PKCE, scoped read-only allowlisted tools, outlet/object authorization, rate limits, audit, freshness & evidence refs; remove `garage_api` wildcard from ChatGPT exposure. Write tools later via preview → digest-bound approval → confirmation in Garage OS → commit → readback → receipt; never expose closing, ledger mutation, QRIS paid, fund transfer, role grant, payroll deduction, audit deletion. Test with MCP Inspector & real ChatGPT plan availability; if unavailable build Aya via Responses API. Never paste tokens in chat; never claim connected until an end-to-end receipt is valid.

**STEP I — SECURITY & RELEASE.** OWASP ASVS 5.0 mapping, permission review, prompt-injection & IDOR tests, ledger invariants, duplicate/split payment tests, OTP abuse tests, backup/restore drill, monitoring, rollback. Staging → pilot → Owner go/no-go.

**OUTPUT CONTRACT:** audit map (files + functions + verified status), architecture, migration plan (idempotent, reversible), route contracts & MCP JSON schemas, OAuth/WhatsApp/email setup plan, permission matrix, UI screens & component specs, tests with results, PDF sample snapshot, SOP kasir/manajer/Owner, rollback guide, security report, traceability matrix F01–F55 → implementation → tests, and evidence that live closing cases remain unchanged. Document missing integrations transparently; no claim of perfection; no production modification without explicit go-live approval.

---

## 35. Matriks fitur F01–F55 & traceability

### 35.1 Fitur keuangan (S2 V3.0)

| Kode | Fitur | Bagian |
|---|---|---|
| F01 | Identitas kasir & outlet | §10.1, §10.9 |
| F02 | Open Shift warning | §10.1 |
| F03 | Cash counting | §10.2 |
| F04 | Balancing bertahap | §10.3 |
| F05 | QRIS reconciliation | §11 |
| F06 | Setoran harian Rp10.000 | §10.7 |
| F07 | Cash In/Out & petty cash | §10.4–10.5 |
| F08 | Pembelian stok internal | §10.6 |
| F09 | Deposit manajer | §12.1 |
| F10 | Close Shift warning | §10.8 |
| F11 | Review & investigasi | §14.4 |
| F12 | Payroll liability review | §15 |
| F13 | Owner approval + 2FA | §13.3 |
| F14 | Daily finance approval | §13.4 |
| F15 | PDF/Excel lengkap | §20.2 |
| F16 | Risk monitoring | §14 |
| F17 | Manager float pecahan | §12.3 |
| F18 | Mandatory double recount | §10.8 |
| F19 | Owner Approval 360 | §13.5 |
| F20 | Fraud risk LV1–LV5 | §14.1 |
| F21 | Dual-party investigation | §14.5–14.7 |
| F22 | Monthly shortage ledger | §16.1 |
| F23 | Exact event timeline | §16.2 |
| F24 | Automatic finance summary | §21 |
| F25 | PDF audit 360 | §20.2 |
| F26 | Control & QA hardening | §27, §28 |
| F27 | Open warning discipline | §10.1 |
| F28 | Tender guard CASH/QRIS | §09.2 |
| F29 | Cash-out belanja bahan | §10.4 |
| F30 | External transfer excluded | §08.3 |
| F31 | Parking mandatory close | §10.7 |
| F32 | Quick Retail Sale | §09.3 |
| F33 | New retail SKU management | §09.3 |
| F34 | Customer payment proof | §09.1 |
| F35 | Owner decision cashflow | §13.5 |
| F36 | Risk cashier & manager | §14.2 |
| F37 | Monthly cashier accountability | §16.1 |
| F38 | PDF detailed cash ledger | §20.2 |
| F39 | Recount & immutable proof | §10.8 |
| F40 | Payment-to-closing QA gates | §28.1 |

### 35.2 Fitur identitas, MCP & UX (ditetapkan V4.0)

| Kode | Fitur | Bagian | Sumber |
|---|---|---|---|
| F41 | Google OAuth staff & member (isolated persona) | §06.1, §06.4–06.5 | S2 V3.1 |
| F42 | Email verification oleh Garage OS | §06.2, §06.7 | S2 V3.1 |
| F43 | WhatsApp OTP verification | §06.7 | S2 V3.1 |
| F44 | Staff application & PENDING_OWNER_APPROVAL | §06.5 | S2 V3.1, S1 |
| F45 | Owner Access Approval Center + MFA | §06.6 | S2 V3.1 |
| F46 | Safe account linking & legacy member migration | §06.4 | S2 V3.1 |
| F47 | Contact change re-verification | §06.4 | S2 V3.1 |
| F48 | Module Registry & capability discovery | §04.1 | S1 |
| F49 | Universal control lifecycle & operation receipt | §07 | S1 |
| F50 | MCP OAuth gateway read-only | §22.1–22.3 | S1, S2 |
| F51 | MCP scoped write (preview/approval/commit) | §22.4 | S1 |
| F52 | Aya in-app Owner Copilot | §21.5 | S1, S2 |
| F53 | Reports Studio + Drive/Gmail automation | §20 | S1 |
| F54 | Enterprise design system & component registry | §24 | S3 |
| F55 | Role-based workspaces & screen registry 16 modul | §23, §25 | S3 |

### 35.3 Traceability sumber

| Domain | S1 | S2 | S3 | Prioritas |
|---|---|---|---|---|
| Dashboard / Finance / Shift | hlm. 3, 7–8, 10, 13–17 | Bag. 01–18, 23–45, 49–59 | §11–12, 14 | P0 |
| POS / Order / QR | hlm. 3, 7, 9 | Bag. 05–08, 34–40 | §10, 13 | P0 |
| Produk / Resep / HPP | hlm. 8–9 | Bag. 02 (protect existing) | §13 | P1 |
| WMS / KDS | hlm. 3, 9 | Bag. 08, 49–50 | §13 | P1 |
| Member / CRM / HR | hlm. 4, 9–10 | Addendum V3.1 hlm. 1–11 | §05, 13 | P2 (identitas P0) |
| Event / Marketing / Table | hlm. 3, 9–10 | invarian payment/role | §13 | P2 |
| Dokumen / Email / Report | hlm. 10–12 | Bag. 15–18, 30–31, 43–45 | §16 | P1 |
| System / MCP / AI / Aya | hlm. 4–6, 11–17 | Bag. 49–59, V3.1 hlm. 8–11 | §15 | P0 |

---

## 36. Glosarium & referensi

### 36.1 Glosarium

| Istilah | Arti |
|---|---|
| Expected Cash | Uang yang seharusnya ada di laci menurut ledger |
| Actual Cash | Uang fisik hasil hitung pecahan |
| Cash Difference | Actual − Expected |
| Blind count | Hitungan tanpa melihat angka expected |
| Deposit / Handover | Perpindahan uang antar penanggung jawab |
| Custody | Penguasaan fisik uang oleh pemegang tertentu |
| Business Date | Tanggal operasional pengelompokan shift/transaksi |
| QRIS Paid vs Settled | Pelanggan berhasil bayar vs dana dicairkan penyedia |
| Exception | Selisih/ketidakcocokan yang perlu pemeriksaan |
| Owner Final Closing | Pengesahan snapshot keuangan dengan MFA; bukan izin potong gaji |
| Case Resolution | Keputusan atas penyebab selisih berdasarkan bukti |
| Operation receipt | Bukti eksekusi backend atas suatu perintah |
| R0–R4 | Tingkat risiko aksi/perintah |
| LV1–LV5 | Tingkat prioritas pemeriksaan sinyal anomali |
| MCP | Model Context Protocol — konektor AI ke Garage OS |
| Aya | Asisten AI in-app Garage OS |
| Step-up / MFA fresh | Re-autentikasi + TOTP baru sebelum aksi sensitif |

### 36.2 Referensi teknis & regulasi

- Repo Garage OS (private): `github.com/killuasurya-boop/garage`
- OpenAI — Connecting custom MCP servers in ChatGPT: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- OpenAI — Custom MCP server guide: https://developers.openai.com/api/docs/guides/custom-mcp-server
- OpenAI — Responses API remote MCP / connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Agents SDK — MCP: https://openai.github.io/openai-agents-python/mcp/
- OpenAI — Sign in with ChatGPT: https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt
- Better Auth — 2FA/TOTP: https://better-auth.com/docs/plugins/2fa · OAuth: https://better-auth.com/docs/concepts/oauth · Email: https://better-auth.com/docs/concepts/email · Account linking: https://better-auth.com/docs/concepts/users-accounts
- MCP TypeScript SDK & Inspector: https://github.com/modelcontextprotocol/typescript-sdk · https://github.com/modelcontextprotocol/inspector
- OWASP ASVS 5.0: https://github.com/OWASP/ASVS
- Google Drive API uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google OAuth scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Gmail API send: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/cloud-api/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- PP 36/2021 tentang Pengupahan: https://jdih.kemnaker.go.id/peraturan/detail/1724/peraturan-pemerintah-nomor-36-tahun-2021
- PP 49/2025 (perubahan kedua PP 36/2021): https://peraturan.bpk.go.id/Details/339037/pp-no-49-tahun-2025
- Pola lain: formancehq/ledger · tigerbeetle · openfga · graphile/worker · opentelemetry-js · pgaudit · temporalio/sdk-typescript

---

> **PENUTUP — GARAGE OS UNIFIED V4.0**
> Fokus akhir bukan "sistem mustahil dicurangi", melainkan catatan yang tidak mudah dimanipulasi, peringatan dini, bukti yang dapat ditelusuri, rekonsiliasi nyata, identitas & otorisasi yang kuat, pengalaman pengguna yang jelas, serta Owner yang memperoleh penjelasan keuangan yang dapat dipercaya. ChatGPT dan Aya menjadi jendela analisis dan kendali terkontrol; **Garage OS tetap sumber kebenaran dan satu-satunya tempat pengesahan uang.**
>
> *Status: rancangan final untuk audit & implementasi. Tidak ada perubahan pada source, database, VPS, pembayaran, atau koneksi ChatGPT production. Semua angka ilustrasi wajib diganti data nyata saat implementasi. Lakukan pemeriksaan hukum ketenagakerjaan sebelum memberlakukan mekanisme potongan payroll.*
