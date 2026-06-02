# ERD & Skema Database (Garage App)

Dokumen ini berisi representasi diagram Entity-Relationship (ERD) dan penjelasan rinci skema database untuk aplikasi **Garage**. Database ini dibangun menggunakan Drizzle ORM dengan PostgreSQL.
Mengingat aplikasi memiliki sekitar 91 tabel, skema telah dikelompokkan menjadi beberapa modul bisnis utama agar lebih mudah dipahami.

---

## 1. Modul Autentikasi & Pengguna (Auth & Users)

Modul ini menangani manajemen pengguna utama (user), autentikasi, sesi, keamanan, dan interaksi umum sistem.

```mermaid
erDiagram
    user ||--o{ session : "has"
    user ||--o{ account : "has"
    user ||--o| two_factor : "has"
    user ||--o{ push_subscriptions : "has"
    user ||--o{ error_events : "resolved_by"
    user ||--o{ feedback_entries : "reports"
    
    user {
        text id PK
        text name
        text email UK
        boolean email_verified
        boolean two_factor_enabled
    }
    
    session {
        text id PK
        text user_id FK
        text token UK
        timestamp expires_at
    }
    
    account {
        text id PK
        text user_id FK
        text provider_id
        text account_id
    }
    
    verification {
        text id PK
        text identifier
        text value
        timestamp expires_at
    }
    
    login_attempts {
        uuid id PK
        text email
        boolean success
        timestamp attempted_at
    }
```

**Penjelasan Kolom Penting:**
- `user`: Merupakan entitas induk untuk seluruh akun login (termasuk staf, admin, owner). `email` harus unik.
- `login_attempts`: Digunakan sebagai audit keamanan untuk mencegah serangan brute force.

---

## 2. Modul Master Data & Organisasi (Master & Org)

Menangani cabang (outlet), profil karyawan, konfigurasi sistem per-outlet, terminal kasir, dan hierarki organisasi.

```mermaid
erDiagram
    user ||--o{ staff_profiles : "assigned_to"
    outlets ||--o{ staff_profiles : "employs"
    outlets ||--o{ app_settings : "has_setting"
    user ||--o{ company_documents : "owns/creates"
    
    outlets {
        uuid id PK
        text code UK
        text name
        text timezone
        text status
    }
    
    staff_profiles {
        uuid id PK
        text user_id FK
        uuid outlet_id FK
        text role
        text pin_hash
        text status
    }
    
    app_settings {
        uuid id PK
        uuid outlet_id FK
        text key
        jsonb value_json
    }
    
    pos_terminals {
        uuid id PK
        text terminal_code UK
        text location
        text api_key_hash UK
    }
    
    company_org_roles {
        uuid id PK
        text role_title UK
        text division
        text reports_to
    }
```

**Penjelasan Kolom Penting:**
- `staff_profiles`: Menyimpan data kepegawaian yang melengkapi tabel `user`. Terdapat PIN untuk login POS cepat (`pin_hash`).
- `app_settings`: Disimpan dalam bentuk Key-Value dengan nilai berformat JSON. Mendukung pengaturan global (jika `outlet_id` null).

---

## 3. Modul Produk & Inventaris (Product & Inventory)

Menangani item menu yang dijual, bahan baku (inventory), mutasi stok, hingga pembuatan resep (BOM/COGS).

```mermaid
erDiagram
    menu_items ||--o{ menu_variants : "has"
    menu_items ||--o{ menu_recipes : "requires"
    inventory_items ||--o{ menu_recipes : "used_in"
    inventory_items ||--o{ stock_movements : "tracked_by"
    inventory_items ||--o{ inventory_location_stocks : "stored_in"
    outlets ||--o{ inventory_location_stocks : "holds"
    inventory_transfer_requests ||--o{ inventory_transfer_items : "contains"
    inventory_items ||--o{ inventory_transfer_items : "transfers"
    stock_opname_sessions ||--o{ stock_opname_items : "validates"
    
    menu_items {
        text id PK
        text name
        text category
        text status
    }
    
    menu_variants {
        uuid id PK
        text item_id FK
        text variant_id
        integer price
        integer base_cost
    }
    
    inventory_items {
        text sku PK
        text name
        text category
        text unit
        real on_hand
        real min_stock
    }
    
    menu_recipes {
        uuid id PK
        text menu_item_id FK
        text inventory_sku FK
        real qty
        text unit
    }
```

**Penjelasan Relasi:**
- `menu_recipes` berfungsi sebagai tabel relasi *Many-to-Many* antara `menu_items`/`menu_variants` dengan `inventory_items` untuk kalkulasi Harga Pokok Penjualan (HPP / Base Cost) dan deduksi stok otomatis.

---

## 4. Modul Pemesanan & Dapur (Orders & Kitchen)

Modul inti sistem Kasir/POS. Menangani pemesanan, tiket dapur, dan status meja.

```mermaid
erDiagram
    outlets ||--o{ orders : "receives"
    customers ||--o{ orders : "places"
    orders ||--o{ order_items : "contains"
    orders ||--o{ payments : "paid_via"
    orders ||--o{ kitchen_tickets : "sends_to"
    outlets ||--o{ table_sessions : "has"
    orders ||--o| table_sessions : "occupies"
    
    orders {
        uuid id PK
        text order_no UK
        uuid outlet_id FK
        uuid customer_id FK
        text status
        integer total
        text order_source
    }
    
    order_items {
        uuid id PK
        uuid order_id FK
        text menu_item_id FK
        text variant_id
        integer unit_price
        integer qty
        integer line_total
    }
    
    payments {
        uuid id PK
        uuid order_id FK
        uuid cash_session_id FK
        text method
        integer amount
        text status
    }
    
    kitchen_tickets {
        uuid id PK
        text ticket_no UK
        uuid order_id FK
        text station
        text status
        jsonb items
    }
```

**Alur Kerja:**
- Sebuah `order` dapat memiliki banyak `order_items` dan `payments` (split bill).
- `kitchen_tickets` dibuat berdasarkan stasiun (misal: "Bar", "Kitchen") dengan menampung array `items` berformat JSON.

---

## 5. Modul Pelanggan, CRM & Marketing

Menangani data loyalitas pelanggan, voucher, riwayat poin, segmentasi pelanggan dinamis, hingga log kampanye broadcast.

```mermaid
erDiagram
    customers ||--o{ customer_tags : "has"
    customers ||--o| member_accounts : "logs_in_as"
    customers ||--o{ member_transactions : "earns_points"
    customers ||--o{ vouchers : "assigned_to"
    vouchers ||--o{ voucher_redemptions : "redeemed_by"
    orders ||--o{ voucher_redemptions : "uses"
    marketing_campaigns ||--o{ marketing_broadcasts : "executes"
    customers ||--o{ crm_campaign_logs : "targeted_in"
    custom_segments ||--o{ custom_segment_customers : "includes"
    
    customers {
        uuid id PK
        text phone UK
        text name
        text tier
        integer points
        integer visits
    }
    
    member_accounts {
        uuid id PK
        uuid customer_id FK
        text phone UK
        text password_hash
    }
    
    vouchers {
        uuid id PK
        text code UK
        text type
        integer value
        text status
    }
    
    marketing_campaigns {
        uuid id PK
        text code UK
        text name
        text channel
        integer budget
        integer spend
        integer actual_revenue
    }
```

**Penjelasan CRM:**
- `custom_segments`: Mendefinisikan kriteria aturan pengguna berbasis JSON.
- `marketing_campaigns`: Digunakan untuk promosi spesifik yang dapat terhubung dengan `vouchers`.

---

## 6. Modul Keuangan, Kas & Pemasok (Finance & Cash)

Mengelola manajemen kasir (buka-tutup kas), pengeluaran operasional (expenses), pembelian barang (receivings) dan utang dagang (supplier invoices).

```mermaid
erDiagram
    outlets ||--o{ cash_sessions : "has"
    user ||--o{ cash_sessions : "opened_by"
    cash_sessions ||--o{ cash_movements : "tracks"
    cash_sessions ||--o{ payments : "reconciles"
    
    suppliers ||--o{ supplier_invoices : "bills"
    suppliers ||--o{ expenses : "paid_to"
    supplier_invoices ||--o{ supplier_receivings : "fulfilled_by"
    supplier_receivings ||--o{ supplier_receiving_items : "contains"
    
    cash_sessions {
        uuid id PK
        text code UK
        integer opening_cash
        integer expected_cash
        integer actual_cash
        text status
    }
    
    supplier_invoices {
        uuid id PK
        uuid supplier_id FK
        text invoice_no UK
        integer amount
        integer paid_amount
        text status
    }
    
    expenses {
        uuid id PK
        uuid supplier_id FK
        text category
        integer amount
        text payment_method
    }
```

---

## 7. Modul SDM, Operasional & Pelatihan (HR, Ops & Training)

Modul besar yang mengurus presensi geolokasi, KPI, penggajian (payroll), ceklist SOP, dan e-learning/pelatihan karyawan.

```mermaid
erDiagram
    staff_profiles ||--o{ employee_attendances : "submits"
    staff_profiles ||--o{ shift_schedules : "assigned_to"
    staff_profiles ||--o{ kpi_evaluations : "evaluated_on"
    staff_profiles ||--o| staff_salaries : "receives"
    staff_profiles ||--o{ staff_payrolls : "paid_via"
    
    training_courses ||--o{ training_lessons : "has"
    user ||--o{ training_progress : "completes"
    training_courses ||--o{ training_progress : "tracked_in"
    
    employee_attendances {
        uuid id PK
        uuid staff_id FK
        text action
        timestamp timestamp
        real latitude
        real longitude
    }
    
    staff_payrolls {
        uuid id PK
        uuid staff_id FK
        text period
        integer base_salary
        integer net_salary
        text status
    }
    
    sop_checklists {
        uuid id PK
        text title
        text role_target
        text shift_target
    }
    
    staff_earnings {
        uuid id PK
        text staff_user_id FK
        uuid order_item_id FK
        integer amount
        text status
    }
```

**Fitur Tambahan SDM:**
- `staff_earnings`: Komisi/insentif yang dihitung per penjualan item untuk staf bersangkutan.
- `employee_attendances`: Mendukung data latitude & longitude untuk validasi presensi di lokasi (Outlet).

---

## 8. Modul AI, Komunikasi Internal & Audit

Modul ini bertanggung jawab untuk log tindakan AI, chat internal antar staf/sistem, dan penanganan kasus audit (Audit Cases).

```mermaid
erDiagram
    ai_agent_configs ||--o{ ai_agent_runs : "executes"
    user ||--o{ ai_owner_chat_history : "chats_with"
    ai_agent_runs ||--o{ ai_action_drafts : "proposes"
    ai_agent_runs ||--o{ ai_agent_events : "logs"
    
    chat_channels ||--o{ chat_channel_members : "has"
    chat_channels ||--o{ chat_messages : "contains"
    
    audit_cases {
        uuid id PK
        text flag_kind
        text severity
        text actor_user_id
        text status
    }
    
    ai_agent_runs {
        uuid id PK
        text intent
        text role
        text status
        text risk_level
    }
    
    chat_channels {
        uuid id PK
        text type
        text name
        text role_key
    }
```

**Fungsi AI & Audit:**
- `ai_agent_runs`: Mencatat eksekusi perintah AI, konsumsi token, dan fallback mechanism.
- `ai_action_drafts`: Sistem menyetujui (approval) aksi berisiko tinggi yang diusulkan oleh agen AI sebelum dieksekusi.
- `audit_cases`: Sistem deteksi anomali internal perusahaan (misal: void transaksi terus menerus) yang menjadi tiket investigasi.

---
*Dokumen ini di-generate secara otomatis berdasarkan file `schema.ts` terbaru. Jika ada perubahan kolom/tabel di kode sumber, maka dokumen ERD ini harus di-update sesuai perubahan tersebut.*
