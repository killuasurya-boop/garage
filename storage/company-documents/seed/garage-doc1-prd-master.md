# DOKUMEN 1: PRODUCT REQUIREMENTS DOCUMENT (PRD)
## GARAGE — Coffee-Tech Operating Ecosystem
**Versi:** 2.0 | **Status:** Final Draft | **Tahun:** 2026  
**Pemilik Dokumen:** Head of Product / Founder  
**Klasifikasi:** CONFIDENTIAL — Internal Use Only

---

## DAFTAR ISI
1. Ringkasan Eksekutif & Tujuan Produk
2. Target Pengguna (User Personas)
3. Daftar Fitur Utama & Minimum Viable Product (MVP)
4. Kriteria Penerimaan (Acceptance Criteria)
5. Asumsi, Kendala, dan Risiko

---

## 1. RINGKASAN EKSEKUTIF & TUJUAN PRODUK

### 1.1 Latar Belakang

GARAGE adalah perusahaan hybrid yang beroperasi di dua domain sekaligus: **premium coffee retail** dan **proprietary SaaS platform** untuk industri kedai kopi. Produk teknologi yang dibangun — disebut **GARAGE OS** — bukan sekadar alat internal, melainkan dirancang sebagai sistem operasi yang dapat dijual kepada merchant kopi lain di seluruh Asia Tenggara.

Filosofi inti pengembangan produk ini adalah **data flywheel**: outlet fisik menghasilkan data transaksi, data tersebut memperkuat algoritma dan fitur produk, produk yang lebih baik memperbaiki margin dan pengalaman pelanggan, dan siklus ini mempercepat ekspansi skala.

### 1.2 Tujuan Produk

| No. | Tujuan | Indikator Keberhasilan |
|-----|--------|------------------------|
| T-01 | Membangun POS yang cepat, stabil, dan bebas bug untuk operasi harian | POS Uptime ≥ 99,9%; Zero P0 bug pasca-launch |
| T-02 | Menyediakan pengalaman pemesanan digital melalui QR Table | Order via QR ≥ 50% dari total transaksi dalam 3 bulan |
| T-03 | Mengotomasi alur dapur agar produksi konsisten dan tepat waktu | SLA produksi rata-rata < 5 menit; Zero missed ticket |
| T-04 | Membangun sistem loyalitas yang mendorong repeat purchase | Repeat rate ≥ 40% dalam 6 bulan pertama |
| T-05 | Mengemas tech stack sebagai SaaS yang dapat dijual ke merchant lain | Onboard 3–5 design partner sebelum public launch SaaS |
| T-06 | Menyediakan dashboard analitik real-time untuk pengambilan keputusan | Weekly active usage dashboard ≥ 80% oleh tim manajemen |

### 1.3 Visi Produk

> *"Menjadi sistem operasi industri kedai kopi di Asia Tenggara pada 2035 — platform tunggal yang menghubungkan outlet fisik, data pelanggan, dan kecerdasan bisnis dalam satu ekosistem terintegrasi."*

### 1.4 Lingkup Produk

GARAGE OS mencakup tiga lapisan produk:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: SaaS Platform (White-label untuk merchant luar)   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: Multi-Outlet Control Center (Franchise & Chain)   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1: Core Operating System (POS, QR, KDS, Inventory)  │
└─────────────────────────────────────────────────────────────┘
```

**Versi MVP** mencakup Layer 1 sepenuhnya, dengan fondasi arsitektur yang mempersiapkan Layer 2 dan 3.

### 1.5 Pendekatan Pengembangan

- **Metodologi:** Agile / Sprint 2 minggu
- **Prioritas:** Core operational stability sebelum fitur retention/loyalty
- **Prinsip:** Offline-first untuk POS (antisipasi koneksi internet tidak stabil di outlet)
- **Bahasa kode:** TypeScript di seluruh stack (type-safety end-to-end)

---

## 2. TARGET PENGGUNA (USER PERSONAS)

### 2.1 Peta Pengguna Sistem

GARAGE OS memiliki **6 tipe pengguna** dengan kebutuhan yang berbeda-beda:

---

### PERSONA 1 — Pemilik/Founder (Owner)

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Rizal, 32 tahun |
| **Role sistem** | Super Admin / Owner |
| **Tujuan utama** | Memantau kesehatan bisnis dari mana saja, kapan saja |
| **Pain points** | Tidak tahu kondisi real-time outlet; data keuangan manual dan sering telat |
| **Kebutuhan fitur** | Dashboard multi-outlet, laporan P&L otomatis, alert kritis via notifikasi |
| **Tech literacy** | Menengah — nyaman dengan aplikasi mobile dan web |
| **Frekuensi akses** | Harian (mobile), mingguan (full dashboard review) |

**Skenario penggunaan:** Rizal membuka dashboard di ponselnya setiap pagi sebelum rapat, melihat revenue kemarin, cup count, dan apakah ada incident SEV-1 yang perlu ditangani.

---

### PERSONA 2 — Manajer Outlet / Supervisor

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Dinda, 27 tahun |
| **Role sistem** | Manager / Supervisor |
| **Tujuan utama** | Memastikan operasional outlet berjalan sesuai SOP dan target harian tercapai |
| **Pain points** | Harus komunikasi manual dengan staf dapur; tidak ada visibilitas stok real-time |
| **Kebutuhan fitur** | Laporan harian outlet, manajemen shift, notifikasi stok menipis, approval komplain |
| **Tech literacy** | Menengah-tinggi |
| **Frekuensi akses** | Sepanjang shift aktif |

---

### PERSONA 3 — Kasir

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Fajar, 22 tahun |
| **Role sistem** | Cashier |
| **Tujuan utama** | Memproses transaksi dengan cepat dan akurat tanpa error |
| **Pain points** | Antrian panjang; tombol POS terlalu banyak dan membingungkan; pembayaran gagal tidak ada notifikasi jelas |
| **Kebutuhan fitur** | Antarmuka POS yang simpel, konfirmasi pembayaran instan, cetak/digital struk |
| **Tech literacy** | Dasar-menengah |
| **Frekuensi akses** | Intensif sepanjang shift (ratusan transaksi/hari) |

**Kebutuhan khusus:** UI harus dapat dioperasikan dengan **satu tangan** di layar tablet; respons sistem < 1 detik per aksi.

---

### PERSONA 4 — Barista / Tim Kitchen

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Tiara, 24 tahun |
| **Role sistem** | Kitchen Staff / Barista |
| **Tujuan utama** | Membaca tiket order dengan jelas dan menyelesaikan dalam SLA yang ditetapkan |
| **Pain points** | Tiket kertas sering hilang atau terbaca salah; tidak ada urutan prioritas yang jelas |
| **Kebutuhan fitur** | Kitchen Display System (KDS) dengan timer, urutan prioritas, status bump |
| **Tech literacy** | Dasar |
| **Frekuensi akses** | Sepanjang shift aktif |

**Kebutuhan khusus:** Layar KDS harus terbaca dari jarak 2 meter; font besar; kontras tinggi.

---

### PERSONA 5 — Pelanggan (End Customer)

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Andi, 28 tahun |
| **Role sistem** | Customer (unauthenticated / member) |
| **Tujuan utama** | Memesan dengan cepat dan mendapatkan kopi yang sesuai harapan |
| **Pain points** | Antre lama; tidak tahu status pesanannya; tidak ingat nomor member |
| **Kebutuhan fitur** | QR Ordering, status pesanan real-time, loyalty poin otomatis terakumulasi |
| **Tech literacy** | Menengah (pengguna smartphone aktif) |
| **Frekuensi akses** | 2–5x per minggu (pelanggan setia) |

---

### PERSONA 6 — Franchisee / Mitra SaaS

| Atribut | Detail |
|---------|--------|
| **Nama representatif** | Budi, 40 tahun (pemilik 3 kedai kopi) |
| **Role sistem** | Tenant Admin (SaaS) |
| **Tujuan utama** | Menggunakan platform GARAGE OS untuk mengelola bisnis kopinya sendiri |
| **Pain points** | POS yang ada mahal dan tidak terintegrasi; laporan manual memakan waktu |
| **Kebutuhan fitur** | Full GARAGE OS dengan white-label, multi-outlet dashboard, laporan keuangan |
| **Tech literacy** | Menengah |
| **Frekuensi akses** | Harian |

---

## 3. DAFTAR FITUR UTAMA & MINIMUM VIABLE PRODUCT (MVP)

### 3.1 Kategori Fitur

Fitur dibagi menjadi tiga horizon berdasarkan urgensi dan kompleksitas:

| Kategori | Definisi | Contoh |
|----------|----------|--------|
| **MVP (Must Have)** | Wajib ada saat soft launch hari pertama | POS, QR Order, KDS |
| **Phase 2 (Should Have)** | Penting untuk retensi dan skala, setelah validasi MVP | Loyalty, CRM, Analytics |
| **Phase 3+ (Nice to Have)** | Diferensiasi jangka panjang dan monetisasi | AI Forecasting, White-label SaaS |

---

### 3.2 Detail Fitur MVP

#### F-01: QR Table Ordering
- **Deskripsi:** Pelanggan memindai QR code di meja, membuka menu digital, memilih produk, dan mengirim pesanan langsung ke sistem tanpa interaksi kasir
- **User yang terlibat:** Customer, Kasir (validasi), Kitchen
- **Alur data:** Customer scan QR → Menu tampil (Next.js) → Pilih item & konfirmasi → POST /api/v1/orders → Backend validate → Kitchen Display update via WebSocket → Kasir menerima notifikasi
- **Ketentuan khusus:** Harus berfungsi tanpa login (unauthenticated guest); opsional login untuk poin loyalty

#### F-02: Point of Sale (POS) — Kasir
- **Deskripsi:** Antarmuka tablet untuk kasir menerima pesanan manual, memproses pembayaran (QRIS, cash, kartu), dan mencetak/mengirim struk
- **User yang terlibat:** Kasir, Sistem Pembayaran (Midtrans)
- **Alur data:** Kasir input order → Validasi stok → Pilih metode bayar → Payment gateway callback → Update inventory → Cetak struk → Update laporan harian
- **Ketentuan khusus:** Harus memiliki mode offline (antrian lokal) jika internet terputus

#### F-03: Kitchen Display System (KDS)
- **Deskripsi:** Layar tampilan di dapur yang menampilkan tiket pesanan secara real-time, lengkap dengan timer SLA dan status
- **User yang terlibat:** Barista/Kitchen staff
- **Alur data:** Order masuk → Backend emit event via Socket.IO → Redis pub/sub → KDS screen update → Barista bump (selesai) → Status order update
- **Ketentuan khusus:** Harus update dalam < 500ms; harus berfungsi saat koneksi intermiten (auto-reconnect)

#### F-04: Manajemen Menu & Inventaris
- **Deskripsi:** Panel admin untuk mengelola katalog menu (nama, harga, bahan, foto), kategori, dan stok bahan baku dengan sistem reorder point otomatis
- **User yang terlibat:** Manager/Admin
- **Alur data:** Admin input menu → DB update → Sync ke QR menu & POS → Setiap transaksi kurangi stok → Alert jika stok < reorder point
- **Ketentuan khusus:** Mendukung modifier/variant (ukuran, tambahan gula, dll.)

#### F-05: User Management & RBAC
- **Deskripsi:** Sistem autentikasi dan otorisasi berbasis peran (Role-Based Access Control)
- **User yang terlibat:** Semua pengguna
- **Peran yang didefinisikan:** Super Admin > Manager > Supervisor > Cashier > Kitchen > Customer
- **Ketentuan khusus:** JWT + Refresh Token; MFA wajib untuk role Manager ke atas

#### F-06: Notifikasi Kritis
- **Deskripsi:** Sistem notifikasi in-app dan push untuk event kritis: order baru masuk, stok menipis, SLA terlewat, dan pembayaran gagal
- **User yang terlibat:** Manager, Kitchen, Kasir
- **Channel:** WebSocket (in-app real-time), email (digest harian), WhatsApp (alert kritis)

#### F-07: Training Center Portal
- **Deskripsi:** Portal konten statis berisi panduan penggunaan sistem, video tutorial, dan FAQ untuk onboarding staf baru
- **User yang terlibat:** Manager, Staff baru
- **Ketentuan khusus:** Dapat diakses tanpa koneksi internet (PWA cached content)

---

### 3.3 Detail Fitur Phase 2

#### F-08: Loyalty & Membership — "GARAGE Pit Stop"
- **Tier:** Mechanic (sign up) → Engineer (50 cup/6 bulan) → Race Crew (150 cup/6 bulan)
- **Mekanisme:** 1 transaksi = 1 stamp; poin dapat ditukar reward
- **Identifikasi:** Nomor telepon sebagai primary key member

#### F-09: Analytics Dashboard
- **Metrik:** Revenue harian/mingguan/bulanan, top selling menu, customer repeat rate, outlet comparison
- **Visualisasi:** Bar chart, line chart, heatmap jam ramai
- **Akses:** Owner (semua outlet), Manager (outlet masing-masing)

#### F-10: CRM & Marketing Automation
- **Fitur:** WhatsApp broadcast, birthday promo, customer reactivation campaign
- **Integrasi:** WhatsApp Business API, Email (SendGrid)

---

### 3.4 Detail Fitur Phase 3+

#### F-11: Multi-Outlet Cloud Control Center
- Perbandingan performa antar outlet
- Transfer stok antar cabang
- Franchise audit dashboard

#### F-12: AI & Predictive Analytics
- Forecasting demand untuk manajemen inventaris
- Rekomendasi menu engineering berbasis data penjualan
- Anomaly detection (transaksi mencurigakan)

#### F-13: GARAGE OS SaaS (White-label)
- Multi-tenant architecture
- Custom domain & branding per tenant
- Billing & subscription management

---

### 3.5 Ringkasan Prioritas Fitur

```
PRIORITAS PENGEMBANGAN GARAGE OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPRINT 1-6   [MVP]     QR Order, POS, KDS, Inventory, Auth
SPRINT 7-12  [Phase 2] Loyalty, Analytics, Notif lanjut, CRM
SPRINT 13+   [Phase 3] Multi-outlet, AI, SaaS Platform
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 4. KRITERIA PENERIMAAN (ACCEPTANCE CRITERIA)

### 4.1 Format Kriteria

Setiap fitur memiliki kriteria penerimaan dalam format **Given–When–Then** (BDD) untuk memudahkan QA dan testing.

---

### AC-F01: QR Table Ordering

| ID | Given | When | Then |
|----|-------|------|------|
| AC-F01-01 | Pelanggan berada di meja dengan QR code aktif | Pelanggan memindai QR code | Halaman menu digital terbuka dalam < 2 detik |
| AC-F01-02 | Menu telah dimuat di halaman | Pelanggan menambahkan item ke keranjang | Total harga terupdate secara instan |
| AC-F01-03 | Pelanggan mengkonfirmasi pesanan | Sistem menerima order | Tiket muncul di KDS dalam < 1 detik |
| AC-F01-04 | Item menu sedang habis | Pelanggan membuka menu | Item ditandai "Sold Out" dan tidak dapat dipilih |

### AC-F02: Point of Sale (POS)

| ID | Given | When | Then |
|----|-------|------|------|
| AC-F02-01 | Kasir sudah login dengan role Cashier | Kasir memproses transaksi | Transaksi tercatat di sistem dan laporan harian |
| AC-F02-02 | Pelanggan memilih QRIS | Kasir memilih metode QRIS | QR pembayaran muncul dalam < 3 detik |
| AC-F02-03 | Pembayaran berhasil dikonfirmasi gateway | Status pembayaran terkonfirmasi | Struk digital/cetak diterbitkan otomatis |
| AC-F02-04 | Koneksi internet terputus | Kasir mencoba memproses transaksi | Sistem beralih ke mode offline; data disinkron saat kembali online |

### AC-F03: Kitchen Display System

| ID | Given | When | Then |
|----|-------|------|------|
| AC-F03-01 | Order masuk dari POS atau QR | Sistem menerima order | Tiket tampil di KDS dalam < 500ms |
| AC-F03-02 | Tiket sudah melebihi SLA (5 menit) | Timer mencapai batas | Tiket berubah warna menjadi merah sebagai peringatan |
| AC-F03-03 | Barista menyelesaikan order | Barista menekan tombol "Selesai" | Tiket hilang dari KDS; status order update ke "Ready" |

### AC-F04: Manajemen Inventaris

| ID | Given | When | Then |
|----|-------|------|------|
| AC-F04-01 | Stok item di bawah reorder point | Sistem mendeteksi kondisi ini | Notifikasi alert dikirim ke Manager dalam < 1 menit |
| AC-F04-02 | Transaksi berhasil diproses | Item terjual | Stok bahan baku terkurangi sesuai resep |
| AC-F04-03 | Admin mengubah harga menu | Perubahan disimpan | Harga baru tampil di QR menu & POS dalam < 30 detik |

### AC-F05: User Management & RBAC

| ID | Given | When | Then |
|----|-------|------|------|
| AC-F05-01 | Pengguna dengan role Kitchen | Pengguna mencoba mengakses menu Laporan Keuangan | Sistem menolak akses dan menampilkan pesan "Unauthorized" |
| AC-F05-02 | Pengguna tidak aktif selama 30 menit | Session habis | Sistem meminta login ulang |
| AC-F05-03 | Manager mencoba login | MFA diaktifkan | Kode OTP dikirim ke nomor terdaftar sebelum akses diberikan |

### 4.2 Kriteria Performa Sistem (Non-Functional)

| Kriteria | Target | Metode Pengukuran |
|----------|--------|-------------------|
| POS Response Time | < 1 detik per aksi | Lighthouse / Load testing |
| KDS Update Latency | < 500ms | WebSocket latency monitoring |
| System Uptime (POS) | ≥ 99,9% | Uptime monitoring (Sentry/UptimeRobot) |
| System Uptime (Customer App) | ≥ 99,5% | Uptime monitoring |
| Mobile Page Load | < 3 detik (3G network) | Lighthouse mobile score |
| Concurrent Users | ≥ 500 pengguna simultan | k6 / Artillery load test |
| Data Backup | Recovery Point Objective < 1 jam | Backup log verification |

---

## 5. ASUMSI, KENDALA, DAN RISIKO

### 5.1 Asumsi

| ID | Asumsi | Dampak jika Salah |
|----|--------|-------------------|
| A-01 | Outlet memiliki koneksi internet (minimal 4G) dengan uptime ≥ 90% | Fitur offline-first harus diperluas cakupannya |
| A-02 | Tablet Android/iPad tersedia di setiap stasiun kasir dan dapur | Perlu penyesuaian UI untuk perangkat dengan spesifikasi berbeda |
| A-03 | Payment gateway Midtrans mendukung seluruh metode pembayaran yang direncanakan | Perlu integrasi gateway alternatif (misalnya Xendit) |
| A-04 | Tim teknis minimal terdiri dari 2 Frontend dan 2 Backend engineer saat fase MVP | Timeline akan molor signifikan jika headcount kurang |
| A-05 | Harga bahan baku stabil dalam 6 bulan pertama untuk validasi unit economics | Perlu buffer 10% pada COGS jika harga fluktuatif |
| A-06 | Regulasi PDP (Perlindungan Data Pribadi) Indonesia sudah dipahami tim | Risiko compliance jika DPO tidak ditunjuk sebelum launch |

### 5.2 Kendala

| ID | Kendala | Kategori | Mitigasi |
|----|---------|----------|----------|
| K-01 | Anggaran MVP terbatas (Rp 100–200 juta) | Finansial | Prioritas fitur ketat; hindari over-engineering |
| K-02 | Tim teknis kecil (< 10 orang) di fase awal | SDM | Gunakan library dan boilerplate yang mature; hindari custom dari nol |
| K-03 | Waktu pengembangan MVP 3 bulan | Waktu | Sprint 2 mingguan dengan demo internal setiap akhir sprint |
| K-04 | Infrastruktur internet di beberapa lokasi outlet tidak stabil | Teknis | Implementasi PWA offline-first; local queue untuk transaksi |
| K-05 | Belum ada brand awareness di pasar | Pemasaran | Fokus pada kualitas produk; gunakan soft launch terbatas |

### 5.3 Risiko Produk

| ID | Risiko | Probabilitas | Dampak | Skor | Mitigasi |
|----|--------|-------------|--------|------|----------|
| R-01 | POS crash saat jam sibuk | Rendah | Kritis | 🔴 Tinggi | Load testing wajib sebelum go-live; mode offline fallback |
| R-02 | Scope creep dari permintaan fitur baru | Tinggi | Sedang | 🟡 Sedang | Gunakan backlog formal; evaluasi dampak tiap sprint |
| R-03 | Integrasi payment gateway gagal/delay | Sedang | Tinggi | 🟡 Sedang | Siapkan 2 gateway (Midtrans + Xendit); test di staging |
| R-04 | Data pelanggan bocor (security breach) | Rendah | Kritis | 🔴 Tinggi | Enkripsi AES-256; audit log; DPO ditunjuk; VAPT wajib |
| R-05 | Tim teknis inti keluar sebelum MVP selesai | Sedang | Kritis | 🔴 Tinggi | Dokumentasi lengkap; ESOP; knowledge transfer wajib |
| R-06 | Pengguna tidak adopsi fitur QR ordering | Sedang | Sedang | 🟡 Sedang | UX testing pra-launch; staff bantu edukasi pelanggan |
| R-07 | Perubahan regulasi PDP yang mempengaruhi cara penyimpanan data | Rendah | Tinggi | 🟡 Sedang | Konsultan legal aktif; arsitektur data yang fleksibel |

### 5.4 Kriteria Go/No-Go untuk Launch

Sebelum soft launch, seluruh kriteria berikut **harus** terpenuhi:

**GO jika:**
- [ ] Seluruh fitur MVP lulus UAT (User Acceptance Testing)
- [ ] Load test berhasil di 200% kapasitas proyeksi peak hour
- [ ] Zero P0 bug yang terbuka di staging
- [ ] DPO sudah ditunjuk dan Privacy Policy sudah dipublikasi
- [ ] Backup database berjalan otomatis dan diverifikasi
- [ ] Tim outlet sudah menyelesaikan training 30 hari
- [ ] PT dan izin operasional lengkap

**NO-GO jika salah satu kondisi di atas belum terpenuhi.**

---

*Dokumen ini akan diperbarui setiap sprint review. Perubahan signifikan memerlukan persetujuan Head of Product dan CTO.*

---
**© 2026 GARAGE Coffee-Tech | CONFIDENTIAL**
