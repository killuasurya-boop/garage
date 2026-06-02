# GARAGE OS — CHECKLIST FINAL MAKSIMAL

> Dokumen kerja AI Agent & Development Team untuk mengembangkan **Garage OS / Garage Coffee & Motor OS** sampai tahap **MVP → Master Pro → Final Production Ready**.
>
> Stack utama: **Next.js App Router · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM Postgres/Neon · Better Auth**.
>
> Tema visual: **asphalt · chrome · red · amber**.
>
> Target device: **Desktop 1366x900 · Tablet · Mobile 390x844**.

---

## 0. MASTER GOAL GARAGE OS

```txt
[ ] Garage OS menjadi operating system internal penuh untuk Garage Coffee & Motor
[ ] Sistem siap dipakai owner, kasir, waiter, kitchen, finance, inventory, HR, member, dan admin
[ ] Sistem bukan hanya demo UI, tetapi memiliki business logic nyata
[ ] Semua modul saling terhubung
[ ] Semua role memiliki akses sesuai tugas kerja
[ ] Semua fitur responsive desktop/tablet/smartphone
[ ] Target desktop 1366x900 aman
[ ] Target mobile 390x844 aman
[ ] Tidak ada overflow
[ ] Tidak ada text clipping
[ ] Tidak ada tombol tumpang tindih
[ ] Tidak ada console error
[ ] Tidak ada fitur dummy tanpa arah production
[ ] Siap MVP
[ ] Siap Master Pro
[ ] Siap Final Production Ready
```

---

# 1. CORE ARCHITECTURE CHECKLIST

## 1.1 Struktur Project

```txt
[ ] src/app menggunakan Next.js App Router dengan rapi
[ ] src/components/garage berisi komponen domain Garage
[ ] src/lib berisi service, auth, role, helper, dan business logic
[ ] src/db berisi Drizzle schema dan database init
[ ] src/scripts berisi audit/security/readiness script
[ ] public berisi aset logo dan franchise site
[ ] Struktur folder mengikuti domain modul
[ ] Komponen besar dipisah menjadi sub-komponen kecil
[ ] Logic bisnis tidak ditaruh sembarangan di UI
[ ] API Route Handlers dipakai untuk backend endpoint
[ ] Server Actions tidak dipakai kecuali benar-benar diminta
```

## 1.2 Stack Standard

```txt
[ ] Next.js App Router stabil
[ ] TypeScript strict digunakan
[ ] Tailwind v4 digunakan konsisten
[ ] shadcn/ui digunakan untuk komponen dasar
[ ] Drizzle ORM digunakan untuk database
[ ] Postgres/Neon digunakan sebagai database utama
[ ] Better Auth digunakan untuk session
[ ] Zod digunakan untuk validasi input
[ ] API response konsisten
[ ] Build tidak membutuhkan koneksi database live
```

## 1.3 Build Safety

```txt
[ ] next build berhasil tanpa koneksi database live
[ ] Database init dibuat lazy
[ ] Tidak ada query DB langsung saat import file
[ ] Tidak ada secret terbaca di client bundle
[ ] Environment variable dicek sebelum runtime penting
[ ] Error env ditampilkan jelas saat server berjalan
```

---

# 2. AUTHENTICATION & SESSION CHECKLIST

```txt
[ ] Login utama staff tersedia
[ ] Login POS khusus kasir tersedia
[ ] Login member tersedia
[ ] Session menggunakan Better Auth
[ ] Session server helper tersedia
[ ] Logout tersedia
[ ] Auto logout watcher tersedia untuk admin/owner
[ ] Password change tersedia
[ ] Reset password admin tersedia
[ ] User session dapat dilihat admin
[ ] Session invalid otomatis redirect login
[ ] Route private tidak bisa diakses tanpa login
[ ] Session expired ditangani rapi
[ ] Login error menampilkan pesan aman
[ ] Tidak menampilkan informasi sensitif saat login gagal
[ ] Proteksi brute force direncanakan
[ ] 2FA tersedia untuk CEO Control / Owner Vault
```

---

# 3. ROLE & PERMISSION CHECKLIST

## 3.1 Role Utama

```txt
[ ] Owner / CEO
[ ] Super Admin
[ ] Admin
[ ] Manager Outlet
[ ] Kasir POS
[ ] Waiter
[ ] Kitchen Staff
[ ] Inventory Staff
[ ] Finance Staff
[ ] HR Staff
[ ] Marketing Staff
[ ] Customer / Member
[ ] Franchise Admin optional
```

## 3.2 Permission Wajib

```txt
[ ] dashboard.view

[ ] pos.access
[ ] pos.create_order
[ ] pos.discount
[ ] pos.void_order
[ ] pos.print_receipt

[ ] kitchen.view
[ ] kitchen.update_status
[ ] kitchen.manage_queue

[ ] waiter.view
[ ] waiter.update_table_status
[ ] waiter.deliver_order

[ ] product.view
[ ] product.create
[ ] product.update
[ ] product.delete

[ ] inventory.view
[ ] inventory.adjust
[ ] inventory.stock_opname
[ ] inventory.reorder

[ ] finance.view
[ ] finance.cash_closing
[ ] finance.report
[ ] finance.export
[ ] finance.approve

[ ] crm.view
[ ] crm.create
[ ] crm.update
[ ] crm.segment

[ ] membership.view
[ ] membership.create
[ ] membership.update
[ ] membership.reward

[ ] marketing.view
[ ] marketing.create_campaign
[ ] marketing.approve_campaign

[ ] approval.view
[ ] approval.approve
[ ] approval.reject

[ ] ceo_control.view
[ ] ceo_control.financial
[ ] ceo_control.security
[ ] ceo_control.users
[ ] ceo_control.permissions

[ ] audit.view
[ ] audit.export

[ ] smart_notif.view
[ ] smart_notif.manage

[ ] garage_ai.view
[ ] garage_ai.execute
[ ] garage_ai.recommend

[ ] chat.view
[ ] chat.send

[ ] settings.view
[ ] settings.update

[ ] team.view
[ ] team.create
[ ] team.update
[ ] team.payroll
[ ] team.shift
[ ] team.attendance

[ ] sop.view
[ ] sop.create
[ ] sop.update
```

## 3.3 Rules Permission

```txt
[ ] Setiap halaman mengecek permission
[ ] Setiap API mengecek permission
[ ] Setiap tombol aksi mengecek permission
[ ] Menu sidebar hanya menampilkan modul yang boleh diakses
[ ] Data finance hanya terlihat oleh role yang berhak
[ ] CEO Control wajib ekstra proteksi
[ ] Role staff tidak boleh melihat data owner vault
[ ] Member hanya bisa melihat data miliknya sendiri
[ ] Permission matrix tersedia
[ ] Role dapat diubah oleh owner/super admin
[ ] Perubahan permission masuk audit log
```

---

# 4. UI/UX GLOBAL CHECKLIST

## 4.1 Theme Garage

```txt
[ ] Tema asphalt-chrome-red-amber konsisten
[ ] Tidak memakai gaya SaaS generik green/blue dominan
[ ] Warna status konsisten
[ ] Background terasa industrial/premium
[ ] Komponen punya spacing rapi
[ ] Font mudah dibaca
[ ] Icon mendukung konteks
[ ] Dashboard tidak terlalu penuh
[ ] Tombol primary jelas
[ ] Tombol destructive jelas
[ ] Badge status mudah dikenali
[ ] Toast notification tersedia
[ ] Modal konfirmasi tersedia
[ ] Drawer action tersedia untuk mobile
[ ] Empty state tersedia
[ ] Loading skeleton tersedia
[ ] Error state tersedia
```

## 4.2 Responsive

```txt
[ ] Desktop memakai sidebar penuh
[ ] Tablet memakai sidebar collapsible
[ ] Mobile memakai bottom nav atau drawer
[ ] POS tablet sangat cepat digunakan
[ ] Cart POS selalu mudah dijangkau
[ ] KDS mudah dibaca dari jarak jauh
[ ] Tabel besar berubah menjadi card list di mobile
[ ] Filter tidak membuat layout rusak
[ ] Form panjang menjadi stepper di mobile
[ ] Semua tombol nyaman disentuh
[ ] Tidak ada horizontal scroll tidak perlu
[ ] Modal mobile tidak keluar layar
[ ] Print preview tetap rapi
```

---

# 5. DATABASE & DATA MODEL CHECKLIST

## 5.1 Auth & User

```txt
[ ] users
[ ] sessions
[ ] accounts
[ ] staff_profiles
[ ] roles
[ ] permissions
[ ] role_permissions
[ ] user_roles
[ ] user_sessions
```

## 5.2 Outlet & Company

```txt
[ ] company_settings
[ ] outlets
[ ] outlet_settings
[ ] outlet_devices
[ ] outlet_operating_hours
[ ] outlet_cash_registers
```

## 5.3 POS & Orders

```txt
[ ] products
[ ] product_categories
[ ] product_variants
[ ] product_prices
[ ] orders
[ ] order_items
[ ] order_item_variants
[ ] order_status_histories
[ ] payments
[ ] receipts
[ ] cashier_shifts
[ ] cashier_shift_transactions
```

## 5.4 Kitchen & Waiter

```txt
[ ] kitchen_tickets
[ ] kitchen_ticket_items
[ ] kitchen_status_logs
[ ] kitchen_sla_logs
[ ] tables
[ ] table_sessions
[ ] waiter_tasks
```

## 5.5 Inventory

```txt
[ ] inventory_items
[ ] inventory_categories
[ ] inventory_units
[ ] stock_movements
[ ] stock_adjustments
[ ] stock_opnames
[ ] suppliers
[ ] purchase_orders
[ ] purchase_order_items
[ ] reorder_rules
```

## 5.6 Finance

```txt
[ ] cash_closings
[ ] cash_closing_items
[ ] cashflow_entries
[ ] expenses
[ ] revenue_summaries
[ ] finance_reports
[ ] invoice_records
[ ] anomaly_logs
```

## 5.7 CRM & Membership

```txt
[ ] customers
[ ] customer_segments
[ ] customer_segment_members
[ ] customer_visits
[ ] memberships
[ ] member_cards
[ ] member_points
[ ] member_rewards
[ ] member_transactions
```

## 5.8 Marketing

```txt
[ ] campaigns
[ ] campaign_targets
[ ] campaign_logs
[ ] vouchers
[ ] voucher_redemptions
```

## 5.9 Approvals & Audit

```txt
[ ] approval_requests
[ ] approval_actions
[ ] audit_logs
[ ] suspicious_activity_logs
[ ] risk_rules
```

## 5.10 HR, SOP, Training

```txt
[ ] employees
[ ] employee_profiles
[ ] attendance_logs
[ ] attendance_locations
[ ] shifts
[ ] shift_assignments
[ ] shift_handovers
[ ] payroll_records
[ ] employee_advances
[ ] team_tasks
[ ] announcements
[ ] sop_documents
[ ] sop_categories
[ ] training_modules
[ ] training_progress
[ ] glossary_terms
```

## 5.11 AI, Notification, Chat

```txt
[ ] notifications
[ ] notification_rules
[ ] voice_settings
[ ] ai_alerts
[ ] ai_recommendations
[ ] ai_conversations
[ ] chat_rooms
[ ] chat_messages
[ ] chat_members
```

---

# 6. API STANDARD CHECKLIST

```txt
[ ] Semua API memakai Route Handlers
[ ] Semua input divalidasi Zod
[ ] Semua API private butuh auth
[ ] Semua API private cek permission
[ ] Semua response sukses konsisten
[ ] Semua response error konsisten
[ ] Error tidak membocorkan stack trace ke client
[ ] API mencatat audit log untuk aksi penting
[ ] API write operation memakai transaction bila perlu
[ ] API inventory tidak boleh membuat stok rusak
[ ] API payment tidak boleh membuat double payment
[ ] API closing tidak boleh closing ganda tanpa rule
[ ] Pagination tersedia untuk list besar
[ ] Search tersedia untuk modul data besar
[ ] Filter tersedia untuk report
[ ] Rate limit direncanakan untuk endpoint sensitif
```

## 6.1 Format Response Sukses

```json
{
  "data": {},
  "message": "Success"
}
```

## 6.2 Format Response Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid"
  }
}
```

---

# 7. DASHBOARD CHECKLIST

```txt
[ ] Dashboard owner command center tersedia
[ ] KPI revenue harian
[ ] KPI revenue bulanan
[ ] KPI order aktif
[ ] KPI approval pending
[ ] KPI selisih kas
[ ] KPI stock accuracy
[ ] KPI kitchen SLA
[ ] KPI offline queue
[ ] KPI fraud alert
[ ] Attendance today widget
[ ] AI alerts bell
[ ] Grafik sales
[ ] Grafik order
[ ] Grafik produk terlaris
[ ] Grafik jam ramai
[ ] Ringkasan outlet
[ ] Ringkasan kasir
[ ] Ringkasan inventory
[ ] Ringkasan finance
[ ] Ringkasan HR
[ ] Dashboard berbeda sesuai role
[ ] Mobile dashboard tidak terlalu padat
[ ] Semua kartu KPI punya sumber data jelas
```

---

# 8. POS CHECKLIST

## 8.1 POS Core

```txt
[ ] POS tablet tersedia
[ ] POS login khusus tersedia
[ ] Menu grid cepat
[ ] Search produk
[ ] Filter kategori
[ ] Produk punya varian harga
[ ] Varian single tersedia
[ ] Varian Cold/Hot tersedia
[ ] Varian Sedang/Pedas tersedia
[ ] Varian Barbeque/Balado/Campur tersedia
[ ] Cart selalu terlihat di tablet
[ ] Cart mobile tetap mudah diakses
[ ] Tambah item ke cart cepat
[ ] Ubah quantity item
[ ] Hapus item
[ ] Catatan per item
[ ] Diskon sesuai permission
[ ] Pajak/service charge bila diperlukan
[ ] Total otomatis benar
[ ] Checkout order
[ ] Pilih metode bayar
[ ] Cash
[ ] QRIS
[ ] Transfer
[ ] E-wallet
[ ] Split payment optional
[ ] Print receipt
[ ] Thermal print
[ ] Print preview
[ ] Sales history
```

## 8.2 POS Advanced

```txt
[ ] Quick reorder
[ ] Upsell AI panel
[ ] Cashier rules panel
[ ] Shift report
[ ] Offline queue design
[ ] Void order butuh permission
[ ] Refund butuh approval
[ ] Cancel item masuk audit
[ ] Semua transaksi masuk finance
[ ] Semua order makanan masuk kitchen
[ ] Semua order ready masuk waiter
[ ] Semua pembelian member masuk CRM/membership
```

---

# 9. KITCHEN DISPLAY SYSTEM CHECKLIST

```txt
[ ] KDS live queue tersedia
[ ] Order baru muncul otomatis atau polling aman
[ ] Item order jelas
[ ] Catatan item terlihat
[ ] Status order: new/preparing/ready/served/cancelled
[ ] Timer tiap order
[ ] ETA panel
[ ] SLA tracking
[ ] Alert jika lebih dari 12 menit
[ ] Kitchen dapat update status
[ ] Status ready masuk waiter
[ ] Status terlihat di customer display
[ ] Kitchen ops masuk CEO Control
[ ] Report performa kitchen tersedia
[ ] Layout KDS besar dan mudah dibaca
```

---

# 10. WAITER CHECKLIST

```txt
[ ] Waiter view tersedia
[ ] Daftar order siap antar
[ ] Status meja tersedia
[ ] Update status meja
[ ] Tandai order delivered
[ ] Catatan meja
[ ] Riwayat order meja
[ ] Waiter task masuk audit/log
[ ] Mobile friendly untuk HP waiter
[ ] Tidak menampilkan data finance sensitif
```

---

# 11. CUSTOMER QUEUE DISPLAY CHECKLIST

```txt
[ ] Display pelanggan tersedia
[ ] Menampilkan nomor/antrian order
[ ] Menampilkan status preparing/ready
[ ] Tidak menampilkan data sensitif
[ ] Layout cocok untuk layar besar
[ ] Auto refresh aman
[ ] Branding Garage kuat
```

---

# 12. PRODUCT MANAGEMENT CHECKLIST

```txt
[ ] CRUD produk
[ ] CRUD kategori produk
[ ] Nama produk
[ ] Alternative name
[ ] SKU
[ ] Kategori
[ ] Unit
[ ] Package size
[ ] Status aktif/nonaktif
[ ] Harga per varian
[ ] Foto produk optional
[ ] Produk bisa dijual/tidak dijual
[ ] Produk bisa terkait raw material
[ ] Search produk
[ ] Filter produk
[ ] Import produk optional
[ ] Export produk optional
[ ] Produk nonaktif tidak muncul di POS
[ ] Perubahan harga masuk audit log
```

---

# 13. INVENTORY CHECKLIST

## 13.1 Inventory Core

```txt
[ ] Data raw material
[ ] Data consumable
[ ] Equipment dipisahkan ke modul aset masa depan
[ ] SKU
[ ] Nama item
[ ] Alternative name
[ ] Category
[ ] Unit
[ ] Package size
[ ] On hand
[ ] Minimum stock
[ ] Status low/watch/safe
[ ] Movement history
[ ] Search inventory
[ ] Filter status stok
[ ] Stock movement otomatis
[ ] Stock adjustment manual
[ ] Stock opname
[ ] Alasan adjustment wajib
[ ] Stok minus dicegah
[ ] Alert stok rendah
```

## 13.2 Inventory Intelligence

```txt
[ ] Smart reorder panel
[ ] Prediksi stok habis
[ ] Rekomendasi reorder quantity
[ ] Inventory intel lintas outlet
[ ] Laporan stok per outlet
[ ] Laporan bahan paling cepat habis
[ ] Alert selisih stok mencurigakan
[ ] Integrasi dengan purchase order
[ ] Integrasi dengan finance
```

---

# 14. SUPPLIER & PURCHASE ORDER CHECKLIST

```txt
[ ] Data supplier
[ ] Kontak supplier
[ ] Produk supplier
[ ] Purchase order
[ ] PO draft
[ ] PO ordered
[ ] PO received
[ ] PO cancelled
[ ] Item PO
[ ] Quantity PO
[ ] Harga beli
[ ] Total PO
[ ] Terima barang
[ ] Barang diterima menambah stok
[ ] Stock movement tercatat
[ ] PO cancelled menyimpan alasan
[ ] Laporan pembelian
[ ] Supplier performance optional
```

---

# 15. FINANCE CHECKLIST

## 15.1 Finance Core

```txt
[ ] Finance view tersedia
[ ] Finance KPI tersedia
[ ] Closing harian
[ ] Cash closing per outlet
[ ] Shift transactions
[ ] Recent orders
[ ] Invoice list
[ ] Cashflow
[ ] Revenue summary
[ ] Expense tracking
[ ] Payment report
[ ] Export laporan
[ ] CFO brief
```

## 15.2 Cash Closing

```txt
[ ] Kasir buka shift
[ ] Kasir tutup shift
[ ] Hitung cash expected
[ ] Input cash actual
[ ] Deteksi selisih kas
[ ] Selisih kas wajib catatan
[ ] Closing masuk approval jika risk tinggi
[ ] Closing masuk audit log
[ ] Owner dapat lihat closing semua outlet
```

## 15.3 Finance Advanced

```txt
[ ] Finance anomaly panel
[ ] Deteksi transaksi tidak biasa
[ ] Deteksi void/refund mencurigakan
[ ] Deteksi selisih closing berulang
[ ] Profit/loss report
[ ] Cashflow konsolidasi
[ ] Multi-outlet finance
[ ] CFO brief otomatis
```

---

# 16. CRM CHECKLIST

```txt
[ ] Customer list
[ ] Detail customer
[ ] Riwayat order customer
[ ] Total spending
[ ] Last visit
[ ] Frequency visit
[ ] Segment manual
[ ] Auto segment AI
[ ] Segment pelanggan baru
[ ] Segment loyal
[ ] Segment dormant
[ ] Segment high value
[ ] Campaign target berdasarkan segment
[ ] Integrasi membership
[ ] Integrasi marketing
[ ] Data customer aman
```

---

# 17. MEMBERSHIP CHECKLIST

```txt
[ ] Member login
[ ] Member dashboard
[ ] Member card
[ ] Premium membership card
[ ] Member analytics
[ ] Member order page QR
[ ] Membership admin view
[ ] Status member aktif/nonaktif
[ ] Level membership
[ ] Point member
[ ] Reward member
[ ] Riwayat transaksi member
[ ] Member bisa melihat benefit
[ ] Member tidak bisa akses data member lain
[ ] POS bisa identifikasi member
[ ] CRM otomatis update data member
```

---

# 18. MARKETING CHECKLIST

```txt
[ ] Marketing module tersedia
[ ] Campaign engine
[ ] Campaign draft
[ ] Campaign active
[ ] Campaign completed
[ ] Campaign cancelled
[ ] Target campaign berdasarkan segment
[ ] Voucher/promo optional
[ ] Landing public site
[ ] Franchise site
[ ] Tracking campaign basic
[ ] Campaign risk approval bila diskon besar
[ ] Integrasi CRM
[ ] Integrasi membership
```

---

# 19. APPROVALS / RISK GATE CHECKLIST

```txt
[ ] Approval board tersedia
[ ] Auto-sweep panel tersedia
[ ] Approval untuk diskon besar
[ ] Approval untuk refund
[ ] Approval untuk void order
[ ] Approval untuk stock adjustment besar
[ ] Approval untuk cash closing selisih besar
[ ] Approval untuk perubahan harga
[ ] Approval untuk database purge
[ ] Approve/reject dengan catatan
[ ] Riwayat approval
[ ] Approval masuk audit log
[ ] Risk rule dapat dikonfigurasi
```

---

# 20. WEBSITE & FRANCHISE CHECKLIST

```txt
[ ] Website public tersedia
[ ] Hero section Garage
[ ] Informasi brand
[ ] Menu highlight
[ ] Lokasi outlet
[ ] CTA order/visit
[ ] Franchise site tersedia
[ ] Halaman franchise
[ ] Lead franchise form optional
[ ] SEO basic
[ ] Mobile friendly
[ ] Tema tetap Garage
```

---

# 21. CEO CONTROL / OWNER VAULT CHECKLIST

## 21.1 Security

```txt
[ ] CEO Control punya route khusus /control
[ ] 2FA wajib
[ ] Session owner lebih ketat
[ ] Auto logout
[ ] Security center
[ ] Permission matrix
[ ] User management
[ ] Global settings
[ ] Theme manager
[ ] Database purge sangat dibatasi
```

## 21.2 Owner Command Center

```txt
[ ] Branches / multi-outlet
[ ] Daily briefing
[ ] Cash closing semua outlet
[ ] Cashflow konsolidasi
[ ] Compliance
[ ] Customer owner view
[ ] Financial report
[ ] Health system
[ ] HR overview
[ ] Inventory intel
[ ] Kitchen ops
[ ] Menu engineering
[ ] Onboarding outlet/karyawan
[ ] Operations overview
[ ] Risk dashboard
[ ] Sales analytics
[ ] SaaS executive view
```

## 21.3 CEO Intelligence

```txt
[ ] Owner dapat melihat outlet terbaik
[ ] Owner dapat melihat outlet bermasalah
[ ] Owner dapat melihat menu paling profit
[ ] Owner dapat melihat menu lambat
[ ] Owner dapat melihat stok rawan
[ ] Owner dapat melihat karyawan top performer
[ ] Owner dapat melihat fraud/risk alert
[ ] Owner mendapat daily brief otomatis
```

---

# 22. FEE SAYA / EARNINGS CHECKLIST

```txt
[ ] Earnings view tersedia
[ ] Saldo fee karyawan/owner
[ ] Payout history
[ ] Komisi berdasarkan aturan
[ ] Komisi kasir/waiter/affiliate optional
[ ] Status payout pending/paid/cancelled
[ ] Export payout
[ ] Akses sesuai role
[ ] Finance dapat validasi payout
[ ] Payout masuk audit log
```

---

# 23. AUDIT CHECKLIST

```txt
[ ] Audit log viewer
[ ] Smart audit dashboard
[ ] Suspicious activity panel
[ ] Semua login tercatat
[ ] Semua create/update/delete penting tercatat
[ ] Void order tercatat
[ ] Refund tercatat
[ ] Stock adjustment tercatat
[ ] Permission change tercatat
[ ] Setting update tercatat
[ ] Cash closing tercatat
[ ] Database purge tercatat
[ ] Audit log immutable secara prinsip
[ ] Audit log tidak bisa dihapus staff biasa
[ ] Filter audit berdasarkan user/modul/tanggal
[ ] Export audit untuk owner
```

---

# 24. SMART NOTIFICATION CHECKLIST

```txt
[ ] AI alerts bell
[ ] Voice settings dialog
[ ] Trigger notification center
[ ] Notif order baru
[ ] Notif kitchen SLA lewat
[ ] Notif stok rendah
[ ] Notif selisih cash closing
[ ] Notif approval pending
[ ] Notif shift mulai/selesai
[ ] Notif member reward
[ ] Notif campaign
[ ] Notif finance anomaly
[ ] Notif bisa dibaca/tandai selesai
[ ] Notif sesuai role
[ ] Voice notification optional
```

---

# 25. GARAGE AI CHECKLIST

```txt
[ ] GARAGE AI simple view untuk user non-teknis
[ ] GARAGE AI UI lengkap
[ ] Chat-bot service tersedia
[ ] AI bisa membaca KPI operasional
[ ] AI bisa memberi rekomendasi stok
[ ] AI bisa memberi rekomendasi menu
[ ] AI bisa memberi alert fraud
[ ] AI bisa memberi daily briefing owner
[ ] AI bisa menjelaskan masalah finance
[ ] AI bisa memberi rekomendasi campaign
[ ] AI bisa membantu SOP/training
[ ] AI tidak boleh menjalankan aksi berbahaya tanpa approval
[ ] AI action harus tercatat audit log
[ ] AI harus membedakan rekomendasi dan eksekusi
```

---

# 26. CHAT INTERNAL CHECKLIST

```txt
[ ] Chat module tersedia
[ ] Chat floating FAB
[ ] Chat antar tim
[ ] Room per outlet
[ ] Room per divisi
[ ] Pesan teks
[ ] Mention optional
[ ] Notifikasi chat
[ ] Riwayat chat
[ ] Akses chat sesuai outlet/role
[ ] Chat tidak membocorkan data sensitif
```

---

# 27. PENGATURAN CHECKLIST

```txt
[ ] Settings manager
[ ] Global settings panel
[ ] Garage app settings schema
[ ] Zod validation untuk settings
[ ] Theme switcher
[ ] Outlet settings
[ ] POS settings
[ ] Printer settings
[ ] Cashier rules settings
[ ] Notification settings
[ ] Voice settings
[ ] Role settings
[ ] Security settings
[ ] Database purge panel sangat dibatasi
[ ] Semua perubahan setting masuk audit log
```

---

# 28. HR / MANAJEMEN TIM CHECKLIST

## 28.1 Employee & Directory

```txt
[ ] Team management dashboard
[ ] Team directory manager
[ ] Profil karyawan
[ ] Role kerja
[ ] Outlet kerja
[ ] Status aktif/nonaktif
[ ] Kontak dasar
[ ] Emergency contact optional
[ ] Dokumen karyawan optional
```

## 28.2 Attendance

```txt
[ ] Attendance page
[ ] Attendance today widget
[ ] HR attendance log
[ ] Employee clock panel
[ ] Absensi masuk
[ ] Absensi pulang
[ ] Geofence check
[ ] Selfie attendance
[ ] Validasi lokasi
[ ] Validasi jam
[ ] Riwayat absensi
[ ] Keterlambatan
[ ] Pulang cepat
[ ] Export absensi
```

## 28.3 Shift

```txt
[ ] Shift page
[ ] Shift scheduler
[ ] Shift assignment
[ ] Shift handover
[ ] Jadwal per outlet
[ ] Jadwal per karyawan
[ ] Conflict detection
[ ] Handover note
[ ] Shift report
```

## 28.4 Payroll & Kasbon

```txt
[ ] Payroll manager
[ ] Advances/kasbon manager
[ ] Gaji dasar optional
[ ] Fee/komisi optional
[ ] Potongan kasbon
[ ] Payout status
[ ] Export payroll
[ ] Akses hanya HR/Finance/Owner
```

## 28.5 Team Productivity

```txt
[ ] Team tasks manager
[ ] Announcements
[ ] Leaderboard
[ ] KPI dashboard
[ ] Task status
[ ] Task assignment
[ ] Performance metric
[ ] Integrasi attendance
[ ] Integrasi kitchen/POS bila perlu
```

---

# 29. SOP & BUKU PINTAR CHECKLIST

```txt
[ ] Buku Pintar tersedia
[ ] Training module
[ ] SOP tutorial widget
[ ] SOP manager
[ ] Glossary manager
[ ] Kategori SOP
[ ] SOP kasir
[ ] SOP kitchen
[ ] SOP waiter
[ ] SOP inventory
[ ] SOP finance closing
[ ] SOP customer service
[ ] SOP emergency
[ ] Training progress karyawan
[ ] Quiz/checklist optional
[ ] SOP bisa dicari
[ ] SOP mobile friendly
```

---

# 30. CROSS-MODUL INTEGRATION CHECKLIST

```txt
[ ] POS order masuk Kitchen
[ ] Kitchen ready masuk Waiter
[ ] POS payment masuk Finance
[ ] POS member order masuk CRM
[ ] POS member order update Membership
[ ] Produk POS terhubung ke Inventory recipe/raw material optional
[ ] Inventory low stock masuk Smart Notif
[ ] Inventory adjustment besar masuk Approval
[ ] Cash closing selisih masuk Approval
[ ] Refund/void masuk Approval
[ ] Semua approval masuk Audit
[ ] Finance anomaly masuk Smart Notif
[ ] CEO Control menarik data semua modul
[ ] GARAGE AI membaca data Dashboard/Finance/Inventory/Kitchen/HR
[ ] HR attendance masuk Dashboard owner
[ ] Campaign memakai segment CRM
[ ] Membership memakai customer data
[ ] Chat internal menghubungkan tim operasional
```

---

# 31. SECURITY CHECKLIST

```txt
[ ] Auth aman
[ ] Session aman
[ ] Role backend aman
[ ] Page guard aman
[ ] API guard aman
[ ] Password tidak pernah disimpan plain text
[ ] Secret hanya di server
[ ] Data finance tidak bocor ke client yang tidak berhak
[ ] CEO Control 2FA
[ ] Audit log untuk aksi sensitif
[ ] Database purge dibatasi
[ ] Input divalidasi Zod
[ ] XSS basic dicegah
[ ] SQL injection dicegah lewat ORM
[ ] CSRF dipertimbangkan untuk aksi sensitif
[ ] Rate limit endpoint login direncanakan
[ ] File upload dibatasi bila ada
[ ] Error production tidak menampilkan stack trace
[ ] Security audit script tersedia
```

---

# 32. PERFORMANCE CHECKLIST

```txt
[ ] POS cepat di tablet
[ ] Menu POS tidak berat
[ ] Cart update instant
[ ] Dashboard tidak memuat semua data mentah
[ ] Report memakai pagination/filter
[ ] Query database dioptimasi
[ ] Index database untuk field penting
[ ] Komponen berat diload seperlunya
[ ] Image asset dioptimasi
[ ] Tidak ada rerender besar tidak perlu
[ ] KDS refresh aman
[ ] Mobile tetap ringan
[ ] Build size dipantau
```

---

# 33. OFFLINE / RELIABILITY CHECKLIST

```txt
[ ] POS memiliki strategi offline queue minimal
[ ] Jika koneksi putus, kasir mendapat warning
[ ] Order pending sync diberi status
[ ] Tidak boleh double submit
[ ] Retry API aman
[ ] Payment tidak boleh tercatat ganda
[ ] Print receipt bisa diulang dengan tanda reprint
[ ] Health dashboard tersedia
[ ] Client error reporter tersedia
[ ] Backup script tersedia
```

---

# 34. TESTING CHECKLIST

## 34.1 Command Test

```bash
npm run db:generate
npm run lint
npm run build
npm run db:migrate
npm run db:seed
```

## 34.2 Browser Test

```txt
[ ] Buka http://127.0.0.1:3000/
[ ] Login seeded berhasil
[ ] Desktop 1366x900 aman
[ ] Mobile 390x844 aman
[ ] Tidak ada console error
[ ] Tidak ada clipping
[ ] Tidak ada kontrol tumpang tindih
```

## 34.3 Functional Test

```txt
[ ] Login staff
[ ] Login POS
[ ] Login member
[ ] Buat order POS
[ ] Pilih varian produk
[ ] Checkout
[ ] Print receipt
[ ] Order muncul di KDS
[ ] Kitchen update ready
[ ] Waiter update delivered
[ ] Payment masuk finance
[ ] Closing shift
[ ] Closing harian
[ ] Tambah produk
[ ] Update harga
[ ] Tambah inventory
[ ] Adjustment stok
[ ] Low stock alert
[ ] Buat customer
[ ] Buat member
[ ] Buat campaign
[ ] Approval approve/reject
[ ] Audit log tercatat
[ ] Attendance check-in
[ ] Shift scheduler
[ ] SOP dibuka
[ ] AI alert muncul
```

---

# 35. MVP CHECKLIST

```txt
[ ] Login staff
[ ] Role dasar
[ ] Dashboard dasar
[ ] POS tablet
[ ] Produk + varian harga
[ ] Cart + checkout
[ ] Receipt print
[ ] Kitchen display basic
[ ] Waiter basic
[ ] Inventory basic
[ ] Finance basic
[ ] Cash closing basic
[ ] CRM basic
[ ] Member basic
[ ] Audit log basic
[ ] Settings basic
[ ] Responsive desktop/tablet/mobile
[ ] Build berhasil
[ ] Seed login berhasil
```

---

# 36. MASTER PRO CHECKLIST

```txt
[ ] Permission matrix granular
[ ] CEO Control
[ ] 2FA owner
[ ] Multi-outlet
[ ] Finance anomaly
[ ] Smart reorder
[ ] Inventory intel
[ ] Kitchen SLA
[ ] Menu engineering
[ ] Membership premium
[ ] CRM auto segment
[ ] Campaign engine
[ ] Approval risk gate
[ ] Smart notification
[ ] GARAGE AI
[ ] Chat internal
[ ] HR attendance geofence + selfie
[ ] Shift scheduler
[ ] Payroll/kasbon
[ ] SOP/training
[ ] Audit suspicious panel
[ ] Health dashboard
[ ] Export laporan
```

---

# 37. FINAL PRODUCTION READY CHECKLIST

```txt
[ ] Semua MVP selesai
[ ] Semua Master Pro selesai
[ ] Security audit selesai
[ ] Readiness audit selesai
[ ] Build production berhasil
[ ] Migration berhasil
[ ] Seed berhasil
[ ] Backup script berjalan
[ ] Semua role diuji
[ ] Semua API private aman
[ ] Semua form divalidasi
[ ] Semua error state tersedia
[ ] Semua loading state tersedia
[ ] Semua empty state tersedia
[ ] Semua modul responsive
[ ] Tidak ada console error
[ ] Tidak ada broken route
[ ] Tidak ada dummy data production yang tertinggal
[ ] Dokumentasi user tersedia
[ ] Dokumentasi admin tersedia
[ ] Dokumentasi teknis tersedia
[ ] Deployment checklist tersedia
```

---

# 38. DEFINITION OF DONE PER FITUR

Satu fitur Garage OS hanya boleh dianggap selesai kalau:

```txt
[ ] UI selesai
[ ] Responsive desktop/tablet/mobile
[ ] Database schema tersedia
[ ] API tersedia
[ ] Validasi Zod tersedia
[ ] Auth check tersedia
[ ] Permission check tersedia
[ ] Loading state tersedia
[ ] Empty state tersedia
[ ] Error state tersedia
[ ] Success toast tersedia
[ ] Audit log tersedia bila penting
[ ] Data terhubung ke modul lain
[ ] Tidak merusak modul lain
[ ] Test manual selesai
[ ] Build tidak error
[ ] Siap digunakan operasional nyata
```

---

# 39. PROMPT CHECKLIST UNTUK AI AGENT

Gunakan prompt ini agar AI Agent selalu bekerja maksimal:

```txt
Kamu adalah AI Development Agent Senior untuk Garage OS.

Tugasmu adalah mengembangkan Garage OS sampai puncak maksimal, bukan sekadar membuat UI demo.

Garage OS adalah operating system internal untuk Garage Coffee & Motor berbasis Next.js App Router, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM Postgres/Neon, dan Better Auth.

Setiap fitur wajib memenuhi checklist:
1. Tujuan bisnis jelas
2. Role pengguna jelas
3. Database schema jelas
4. API Route Handler jelas
5. Validasi Zod
6. Auth check
7. Permission check
8. Business logic nyata
9. UI/UX responsive
10. Loading state
11. Empty state
12. Error state
13. Toast notification
14. Audit log bila penting
15. Integrasi lintas modul
16. Testing checklist
17. Tidak ada dummy tanpa arah production

Modul utama:
Dashboard, POS, Kitchen KDS, Waiter, Produk Manajemen, Inventory, Finance, CRM, Membership, Marketing, Approvals, Website, CEO Control, Fee Saya, Audit, Smart Notif, GARAGE AI, Chat Internal, Pengaturan, Manajemen Tim, dan Buku Pintar.

Semua modul harus saling terhubung:
POS → Kitchen → Waiter → Finance → Audit
POS → CRM → Membership
Inventory → Smart Notif → Purchase Order → Finance
Finance → CEO Control → GARAGE AI
HR → Attendance → Payroll → Dashboard
Marketing → CRM Segment → Membership
Approvals → Audit → Risk Dashboard

Jangan membuat fitur dummy.
Jangan membuat API tanpa validasi.
Jangan membuat API tanpa permission.
Jangan mengabaikan mobile.
Jangan menghilangkan tema Garage asphalt-chrome-red-amber.
Jangan membuat style SaaS generik.
Jangan membuat build bergantung pada koneksi DB live.

Target akhir:
MVP siap operasional, Master Pro lengkap, Final Production Ready aman, cepat, responsif, dan siap digunakan bisnis nyata.
```

---

# 40. PRIORITAS EKSEKUSI PALING TEPAT

```txt
1. Core architecture
2. Auth + session
3. Role + permission matrix
4. Layout shell + navigation
5. Dashboard basic
6. POS core
7. Product management
8. Payment + receipt
9. Kitchen KDS
10. Waiter
11. Sales history
12. Finance basic
13. Cash closing
14. Inventory basic
15. CRM basic
16. Membership basic
17. Audit log
18. Settings
19. CEO Control
20. Approvals
21. Smart notification
22. GARAGE AI
23. HR attendance
24. Shift
25. Payroll/kasbon
26. SOP/training
27. Marketing/campaign
28. Multi-outlet
29. Finance anomaly
30. Inventory intelligence
31. Security hardening
32. Performance optimization
33. Full responsive test
34. Full role test
35. Release readiness audit
36. Deployment
```

---

# 41. RULES KERJA AI AGENT SAAT MENERIMA TUGAS

Setiap kali user meminta pembuatan atau perbaikan fitur, AI Agent wajib menjawab atau bekerja dengan struktur berikut:

```txt
1. Identifikasi tujuan fitur
2. Identifikasi role pengguna
3. Identifikasi modul terkait
4. Cek dampak ke database
5. Cek dampak ke API
6. Cek dampak ke permission
7. Cek dampak ke UI responsive
8. Cek dampak ke finance/inventory/audit bila relevan
9. Buat implementasi bertahap
10. Tambahkan validasi
11. Tambahkan error handling
12. Tambahkan loading/empty state
13. Tambahkan audit log untuk aksi penting
14. Jalankan testing checklist
15. Pastikan build tidak rusak
```

---

# 42. LARANGAN UTAMA UNTUK AI AGENT

```txt
[ ] Jangan membuat UI tanpa backend plan
[ ] Jangan membuat endpoint tanpa Zod
[ ] Jangan membuat endpoint tanpa auth check
[ ] Jangan membuat endpoint tanpa permission check
[ ] Jangan membuat modul yang tidak terhubung ke modul lain
[ ] Jangan mengubah finance tanpa audit log
[ ] Jangan mengubah inventory tanpa stock movement
[ ] Jangan membuat payment double-submit
[ ] Jangan membuat POS lambat di tablet
[ ] Jangan membuat mobile overflow
[ ] Jangan membocorkan data finance ke role tidak berhak
[ ] Jangan menghapus audit log
[ ] Jangan membuat CEO Control tanpa 2FA
[ ] Jangan mengubah tema Garage menjadi SaaS generik
```

---

# 43. RILIS FINAL — GO / NO-GO CHECKLIST

```txt
[ ] Semua route utama bisa dibuka
[ ] Semua role bisa login
[ ] Semua role hanya melihat menu sesuai akses
[ ] POS bisa membuat transaksi nyata
[ ] Kitchen menerima order
[ ] Waiter menerima order ready
[ ] Finance menerima payment
[ ] Cash closing berjalan
[ ] Inventory update berjalan
[ ] CRM menerima data customer
[ ] Membership terhubung transaksi
[ ] Audit mencatat aksi penting
[ ] CEO Control aman
[ ] GARAGE AI hanya memberi rekomendasi aman
[ ] Notifikasi sesuai role
[ ] HR attendance berjalan
[ ] SOP bisa dibaca staff
[ ] Build production sukses
[ ] Tidak ada console error
[ ] Tidak ada layout rusak mobile
[ ] Backup tersedia
[ ] Dokumentasi tersedia
[ ] Sistem layak digunakan operasional
```

---

## Catatan Akhir

Checklist ini adalah standar puncak maksimal Garage OS. AI Agent tidak boleh hanya menyelesaikan tampilan satu modul secara terpisah. Setiap fitur harus selalu dipikirkan sebagai bagian dari ekosistem:

```txt
POS → Kitchen → Waiter → Finance → Audit → CEO Control
Inventory → Smart Notif → Purchase Order → Finance
CRM → Membership → Marketing
HR → Shift → Attendance → Payroll → Dashboard
GARAGE AI → Rekomendasi → Approval → Audit
```

Target akhirnya adalah Garage OS yang **aman, cepat, responsif, terhubung, dan siap digunakan untuk operasional bisnis nyata**.
