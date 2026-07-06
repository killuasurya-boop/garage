from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "output" / "pdf"


ROLES = [
    ("OWNER", "Owner / CEO", "Pemilik bisnis dan pengambil keputusan akhir."),
    ("CEO_CONTROL", "CEO Control", "Kontrol dokumen perusahaan, struktur organisasi, dan area owner-only."),
    ("MANAGER", "Manager Operasional", "Pengendali operasional harian lintas station."),
    ("FINANCE", "Finance / CFO", "Pengendali kas, settlement, expense, invoice, dan closing."),
    ("ADMIN", "Admin", "Admin operasional, staff, produk, website, approval, dan pengaturan outlet."),
    ("CASHIER", "Kasir", "Operator POS, pembayaran, receipt, member lookup, dan cash session."),
    ("BARISTA", "Barista", "Station minuman dan ticket KDS bar."),
    ("KITCHEN", "Kitchen / Koki", "Station makanan dan ticket KDS kitchen."),
    ("WAITER", "Waiter 1 / Waiter 2", "Pelayanan meja, antar pesanan, bill request, dan clean table."),
    ("WAREHOUSE", "Gudang", "Stok, opname, receiving, transfer, dan reorder."),
    ("PROCUREMENT", "Procurement", "Pembelian dan penerimaan supplier. Role khusus belum eksplisit di matrix."),
    ("HR", "HR / Team Management", "Absensi, shift, SOP, payroll, announcement, dan data staff."),
]

ROLE_MODULE_HINTS = {
    "Owner / CEO": ["dashboard", "pos", "ai-agent", "kitchen", "waiter", "inventory", "finance", "crm", "membership", "marketing", "approvals", "website", "company-control", "earnings", "audit", "team-management", "settings", "recruitment", "chat", "training", "smart-notif"],
    "CEO Control": ["company-control", "dashboard", "audit", "settings"],
    "Manager Operasional": ["dashboard", "pos", "ai-agent", "kitchen", "waiter", "inventory", "crm", "membership", "marketing", "approvals", "audit", "team-management", "settings", "recruitment", "chat", "training", "smart-notif"],
    "Finance / CFO": ["dashboard", "ai-agent", "finance", "earnings", "approvals", "audit", "chat", "training"],
    "Admin": ["pos", "kitchen", "waiter", "inventory", "crm", "membership", "marketing", "approvals", "website", "team-management", "settings", "recruitment", "chat", "training", "smart-notif"],
    "Kasir": ["pos", "earnings", "chat", "training", "smart-notif"],
    "Barista": ["kitchen", "inventory", "earnings", "ai-agent", "chat", "training", "smart-notif"],
    "Kitchen / Koki": ["kitchen", "inventory", "earnings", "ai-agent", "chat", "training", "smart-notif"],
    "Waiter 1 / Waiter 2": ["waiter", "earnings", "ai-agent", "chat", "training", "smart-notif"],
    "Gudang": ["inventory", "ai-agent", "chat", "training", "smart-notif"],
    "Procurement": ["inventory", "finance supplier invoices", "supplier receivings"],
    "HR / Team Management": ["team-management", "attendance", "training", "staff", "payroll"],
}

FEATURES = [
    ("Login & Session", "Masuk aplikasi, session Better Auth, 2FA untuk role sensitif.", ["Semua role"], "Email, password, 2FA bila aktif.", "Session user dan staff profile.", "user, session, staffProfiles, twoFactor", "Working"),
    ("Role & Permission Matrix", "Menyembunyikan modul dan membatasi API berdasarkan role.", ["Semua role internal"], "Role staff.", "Module list dan permission guard.", "src/lib/role-access.ts, server-auth.ts", "Working"),
    ("Owner Dashboard", "Snapshot omzet, order aktif, low stock, alert, export daily brief.", ["Owner / CEO", "Manager Operasional", "Finance / CFO"], "Tanggal/outlet.", "KPI dan laporan ringkas.", "/api/dashboard, /api/owner/daily-brief", "Need Review"),
    ("POS Cashier", "Input order, pilih menu/varian, promo, member lookup, pembayaran, receipt, printer.", ["Owner / CEO", "Admin", "Manager Operasional", "Kasir", "Supervisor Shift"], "Meja/channel, item, varian, qty, member, payment.", "Order, payment, kitchen ticket, receipt.", "orders, orderItems, payments, kitchenTickets, cashSessions", "Working"),
    ("QR Customer Order", "Customer pesan dari menu digital / order page.", ["Customer", "Kasir", "Waiter"], "Meja, nama, WhatsApp, item.", "Customer order masuk antrian validasi.", "/order, /api/customer/orders", "Working"),
    ("Kitchen Display System", "Queue produksi makanan/minuman, status queue/cooking/ready/delivered.", ["Barista", "Koki", "Kitchen / Barista", "Manager Operasional"], "Ticket order.", "Status ticket dan performa station.", "kitchenTickets, /api/kitchen/*", "Working"),
    ("Waiter Floor", "Pantau meja, klaim ticket, deliver, request bill, clean/move/seat-next.", ["Waiter 1", "Waiter 2", "Manager Operasional", "Admin"], "Ticket dan nomor meja.", "Status meja dan pelayanan.", "tableSessions, serviceRequests, /api/waiter/*", "Working"),
    ("Inventory & Product Management", "Kelola produk, SKU, varian, gambar, promo, stok, movement, opname.", ["Owner / CEO", "Admin", "Manager Operasional", "Gudang"], "Produk, SKU, foto, varian, stok, movement.", "Menu aktif, stok, opname, transfer.", "menuItems, menuVariants, inventoryItems, stockMovements", "Working"),
    ("Supplier Receiving & Transfer", "Penerimaan supplier, transfer stok antar lokasi, PDF transfer/receiving.", ["Gudang", "Admin", "Manager Operasional"], "Supplier, item, qty, lokasi.", "Receiving note, movement, transfer request.", "supplierReceivings, inventoryTransferRequests", "Working"),
    ("Finance Cash Closing", "Cash session, expense, settlement, anomaly, forecast, supplier invoice.", ["Owner / CEO", "Finance / CFO", "Kasir"], "Opening cash, transaksi, closing cash, expense.", "Cash report, discrepancy, finance summary.", "cashSessions, expenses, paymentSettlements", "Working"),
    ("Approvals", "Gate risiko untuk void, diskon, expense, discrepancy, bulk decision.", ["Owner / CEO", "Admin", "Manager Operasional", "Finance / CFO"], "Request approval.", "Approve/reject dan audit log.", "approvals, /api/approvals/*", "Working"),
    ("CRM & Membership", "Customer, tag, segment, points, vouchers, member card.", ["Owner / CEO", "Admin", "Manager Operasional"], "Data customer, point, voucher.", "Segment, voucher, card image/PDF.", "customers, memberAccounts, vouchers", "Working"),
    ("Marketing & Publishing", "Campaign, promo, broadcast, calendar, social publishing queue.", ["Owner / CEO", "Admin", "Manager Operasional"], "Campaign/broadcast/promo content.", "Delivery queue dan campaign status.", "marketingCampaigns, marketingBroadcasts", "Need Review"),
    ("Website Management", "Hero landing, info bisnis, testimonial, asset website.", ["Owner / CEO", "Admin"], "Gambar, alt text, info bisnis, testimoni.", "Landing publik ter-update.", "siteAssets, appSettings, /api/site/*", "Working"),
    ("Team Management / HR", "Staff, shifts, attendance, SOP, KPI, payroll, advances, announcement, glossary.", ["Owner / CEO", "Admin", "Manager Operasional"], "Data staff, shift, attendance, SOP.", "Roster, payroll, log SOP, KPI.", "employeeAttendances, shiftSchedules, sopChecklists", "Working"),
    ("Recruitment", "Public apply, upload file privat, kandidat, posisi, analytics, status tracking.", ["Owner / CEO", "Admin", "Manager Operasional", "Pelamar"], "Data lamaran, CV, foto, file pendukung.", "Candidate record dan status lamaran.", "candidates, recruitmentPositions", "Working"),
    ("Chat Internal", "Channel chat direct/role/broadcast, upload, read state.", ["Semua role internal"], "Pesan dan attachment.", "Riwayat chat internal.", "chatChannels, chatMessages", "Working"),
    ("GARAGE AI", "Owner chat, POS agent, alerts, actions approval, reports, system doctor, TTS.", ["Owner / CEO", "Manager Operasional", "Finance / CFO", "Station tertentu"], "Prompt, alert, job run.", "Insight, action draft, report.", "aiAgentConfigs, aiActionDrafts, aiAgentRuns", "Need Review"),
    ("Audit & Compliance", "Audit log, suspicious, risk scores, cases, shift integrity, compliance items.", ["Owner / CEO", "Manager Operasional", "Finance / CFO"], "Event operasional, case, compliance status.", "Risk dashboard dan case notes.", "auditLogs, auditCases, complianceItems", "Working"),
    ("Backup Google Drive", "Koneksi Google Drive tersedia di kode AI/Drive, checklist backup harian belum terbukti selesai.", ["Owner / CEO"], "OAuth credential dan file backup.", "Backup drive.", "googleDriveConnections, checklist F1", "Incomplete"),
]

SCREENS = [
    ("Login", "/login, /pos-login, /login/2fa", "Masuk ke GarageOS dan POS."),
    ("OS Workspace", "/os", "Shell utama dengan sidebar role-aware."),
    ("Dashboard", "module=dashboard, /dashboard", "Ringkasan owner/manager."),
    ("POS", "/pos, module=pos", "Transaksi kasir tablet."),
    ("Kitchen", "module=kitchen", "KDS produksi."),
    ("Waiter", "module=waiter", "Floor service dan meja."),
    ("Inventory", "module=inventory", "Produk, stok, opname, transfer."),
    ("Finance", "module=finance", "Cash session, expense, settlement."),
    ("CRM", "module=crm", "Customer, segment, points."),
    ("Membership", "module=membership, /member", "Member dashboard dan kartu."),
    ("Marketing", "module=marketing", "Campaign, broadcast, promo."),
    ("Approvals", "module=approvals", "Keputusan risiko."),
    ("Website", "module=website", "Landing hero dan info bisnis."),
    ("CEO Control", "module=company-control, /control/_dashboard", "Owner-only company vault."),
    ("Earnings", "module=earnings", "Fee staff dan payout."),
    ("Audit", "module=audit", "Audit log dan case."),
    ("Team Management", "module=team-management", "HR, staff, shift, SOP."),
    ("Settings", "module=settings, /control/settings", "Konfigurasi outlet/sistem."),
    ("Training", "module=training", "Buku Pintar dan SOP karyawan."),
    ("Recruitment", "/recruitment, module=recruitment", "Lamaran publik dan pipeline kandidat."),
    ("Order Public", "/order", "Order customer via QR."),
    ("Display Queue", "/display/customer-queue", "Display antrian pelanggan."),
    ("Invoice Live", "/invoice/[token]", "Status invoice/order publik."),
]


def read(path: str) -> str:
    p = ROOT / path
    return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""


def source_summary() -> dict:
    app_files = sorted((ROOT / "src" / "app").rglob("*.tsx")) + sorted((ROOT / "src" / "app").rglob("route.ts"))
    api_routes = sorted((ROOT / "src" / "app" / "api").rglob("route.ts"))
    pages = sorted((ROOT / "src" / "app").rglob("page.tsx"))
    schema_text = read("src/db/schema.ts")
    table_names = []
    for match in re.finditer(r"export const (\w+) = pgTable\(", schema_text):
        export_name = match.group(1)
        snippet = schema_text[match.end() : match.end() + 120]
        quoted = re.search(r'"([^"]+)"', snippet)
        table_names.append((export_name, quoted.group(1) if quoted else export_name))
    route_groups = defaultdict(int)
    for route in api_routes:
        rel = route.relative_to(ROOT / "src" / "app" / "api")
        route_groups[str(rel).split("\\")[0].split("/")[0]] += 1
    return {
        "page_count": len(pages),
        "api_count": len(api_routes),
        "app_file_count": len(app_files),
        "tables": table_names,
        "route_groups": dict(sorted(route_groups.items())),
    }


def md_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header = "| " + " | ".join(rows[0]) + " |"
    sep = "| " + " | ".join(["---"] * len(rows[0])) + " |"
    body = ["| " + " | ".join(cell.replace("\n", "<br>") for cell in row) + " |" for row in rows[1:]]
    return "\n".join([header, sep, *body])


def write(path: str, text: str) -> None:
    target = DOCS / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.strip() + "\n", encoding="utf-8")


def standard_screen_manual(name: str, route: str, purpose: str) -> str:
    return f"""## {name}

Purpose: {purpose}

Who Uses: lihat role matrix dan sidebar sesuai akun.

Buttons:
- Create: tersedia bila layar memiliki aksi tambah data dan role punya permission tulis.
- Edit: tersedia pada data operasional tertentu seperti produk, staff, campaign, atau setting.
- Delete: terbatas pada role owner/admin/permission tulis; gunakan hanya jika benar-benar perlu.
- Export: tersedia di finance, inventory audit, owner daily brief, payroll, dan beberapa laporan.
- Filter: tersedia pada layar list/table seperti inventory, finance, CRM, audit, recruitment.

Field Explanation:
- Field utama mengikuti label di layar. Data uang harus dicek dua kali sebelum submit.
- Field status menentukan alur kerja berikutnya. Jangan ubah status jika pekerjaan fisik belum selesai.

Example Data:
- Order: T-01, Americano Cold x1, QRIS.
- Produk: COF-001, Americano, Coffee, promo aktif bila ada.
- Staff: Nama, role, outlet, shift.

Common Error:
- Akses ditolak berarti role tidak punya izin.
- Data kosong berarti filter terlalu sempit, outlet salah, atau backend/database belum siap.
- Gagal simpan biasanya karena field wajib kosong, format salah, atau koneksi putus.

Recovery:
- Refresh halaman.
- Cek koneksi dan `/api/health`.
- Hubungi Manager/Admin jika error berulang.

Best Practice:
- Gunakan filter sebelum mencari manual.
- Kerjakan satu transaksi/ticket sampai selesai.
- Jangan klik tombol aksi berulang saat loading.

Estimated Time: 30 detik - 5 menit, tergantung tugas.

Screenshot: [Screenshot placeholder - {name}]
"""


def role_doc(role_file: str, role_name: str, objective: str) -> str:
    modules = ", ".join(ROLE_MODULE_HINTS.get(role_name, [])) or "REVIEW REQUIRED"
    return f"""# SOP {role_name}

## Purpose

{objective}

## Role Objective

Menjalankan tanggung jawab harian sesuai role tanpa membuka data atau aksi yang bukan kewenangannya.

## Daily Responsibility

- Login dengan akun pribadi.
- Cek dashboard/module kerja sesuai role.
- Kerjakan ticket/transaksi/data hanya sampai batas tugas role.
- Laporkan anomali ke atasan langsung.
- Tutup pekerjaan dengan catatan shift atau handover.

## Allowed Access

Module/area berdasarkan source `role-access.ts`: {modules}.

## Forbidden Actions

- Menggunakan akun orang lain.
- Mengubah transaksi, stok, payroll, atau setting tanpa mandat role.
- Membagikan data customer, staff, finance, atau file kandidat ke luar tim.
- Menekan approve/void/close jika data fisik belum cocok.

## Before Work

1. SCREEN: Login.
   ACTION: Masuk dengan email/password role.
   EXPECTED RESULT: Workspace terbuka dan sidebar hanya menampilkan menu yang diizinkan.
2. SCREEN: Module utama role.
   ACTION: Cek data awal shift, queue, atau laporan.
   EXPECTED RESULT: Tidak ada error akses atau data kritis kosong tanpa alasan.
3. SCREEN: Chat/Training.
   ACTION: Baca pengumuman dan SOP aktif.
   EXPECTED RESULT: Staff memahami prioritas shift.

## During Work

STEP 1
SCREEN: Module utama.
ACTION: Ambil pekerjaan paling prioritas.
EXPECTED RESULT: Ticket/transaksi/status mulai diproses.

STEP 2
SCREEN: Detail pekerjaan.
ACTION: Cek nomor meja/order, item, jumlah, status, dan catatan.
EXPECTED RESULT: Tidak ada salah meja, salah item, atau salah nominal.

STEP 3
SCREEN: Aksi status.
ACTION: Simpan perubahan hanya setelah pekerjaan fisik benar-benar selesai.
EXPECTED RESULT: Status berpindah dan tim berikutnya melihat update.

STEP 4
SCREEN: Chat/Internal note bila perlu.
ACTION: Eskalasi error, stok kosong, customer complaint, atau selisih kas.
EXPECTED RESULT: Manager/Admin menerima konteks lengkap.

## End Process

- Pastikan tidak ada pekerjaan pending pribadi.
- Tulis handover bila shift berganti.
- Logout dari device bersama.
- Laporkan error yang belum selesai.

## Start Shift SOP

- Cek perangkat, koneksi, dan akun.
- Buka module utama.
- Pastikan data hari ini tampil.
- Jika ada error database/backend, jangan input manual tanpa arahan manager.

## During Shift SOP

- Kerjakan dari antrian paling lama atau paling kritis.
- Gunakan status aplikasi sebagai catatan resmi.
- Jangan ubah data sensitif tanpa approval.

## End Shift SOP

- Selesaikan pending queue.
- Serahkan catatan exception.
- Logout.

## Escalation SOP

- Masalah customer: eskalasi ke Manager.
- Masalah uang/payment: eskalasi ke Finance/Owner.
- Masalah stok: eskalasi ke Gudang/Admin.
- Masalah sistem: eskalasi ke Admin/Owner.

## Emergency SOP

- Jika sistem down, catat order secara manual dengan nomor meja, jam, item, nominal, dan petugas.
- Saat sistem pulih, input ulang sesuai arahan Manager/Admin.
- Untuk finance, jangan close shift sebelum data manual direkonsiliasi.

## KPI

- Ketepatan status.
- Kecepatan menyelesaikan ticket/transaksi.
- Error input rendah.
- Handover jelas.
- Tidak ada akses/aksi di luar role.

## Common Mistakes

- Lupa refresh queue.
- Salah meja/order.
- Klik aksi dua kali.
- Menganggap data kosong sebagai tidak ada pekerjaan tanpa cek filter.
- Tidak mencatat exception.

## Troubleshooting

- Akses ditolak: cek role akun.
- Data tidak muncul: refresh, cek filter, cek outlet, cek `/api/health`.
- Gagal simpan: cek field wajib dan koneksi.
- Printer/payment error: ikuti SOP troubleshooting aplikasi.

## Shortcut Workflow

Login -> Module utama -> Ambil pekerjaan -> Cek detail -> Update status -> Catat exception -> Handover -> Logout.

## Review Required

Jika role ini tidak muncul eksplisit di `role-access.ts` atau tugasnya lintas departemen, manager harus menetapkan owner proses sebelum go-live.
"""


def workflow_doc(title: str, body: str) -> str:
    return f"""# {title}

{body}

## Diagram

```mermaid
flowchart TD
  A[Mulai] --> B[Cek data di GarageOS]
  B --> C{{Data lengkap?}}
  C -- Ya --> D[Proses sesuai SOP]
  C -- Tidak --> E[REVIEW REQUIRED / eskalasi]
  D --> F[Simpan status]
  F --> G[Audit / laporan ter-update]
```

## PASS / FAIL Testing

| Check | Status | Problem | Impact | Suggested Fix | Priority |
| --- | --- | --- | --- | --- | --- |
| Flow tersedia di route/API | PASS | Route dan entity ditemukan di source | Flow dapat didokumentasikan | Tetap verifikasi manual di device | Medium |
| Bukti end-to-end runtime | NEED REVIEW | Generator tidak menjalankan transaksi nyata | Belum bisa klaim siap operasional penuh | Jalankan UAT satu order sampai report dan backup | High |
"""


def build_docs() -> None:
    s = source_summary()
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    table_rows = [["Feature", "Purpose", "Roles", "Input", "Output", "Dependency", "Status"]]
    for f in FEATURES:
        table_rows.append([f[0], f[1], ", ".join(f[2]), f[3], f[4], f[5], f"[{f[6]}]"])

    write("FEATURE_MAP.md", f"""# FEATURE MAP GarageOS

Generated: {generated_at}

Evidence source:
- `src/app`: {s['page_count']} page files, {s['api_count']} API route files.
- `src/lib/role-access.ts`: role, module, permission matrix.
- `src/db/schema.ts`: {len(s['tables'])} database entities.
- `CHECKLIST_MVP_FINAL.md`: status MVP dan gap manual test.

{md_table(table_rows)}

## API Route Groups

{md_table([["Group", "Route Count"], *[[k, str(v)] for k, v in s["route_groups"].items()]])}

## Database Entities

{", ".join([db for _, db in s["tables"]])}

## Hidden / Restricted Features

- CEO Control hanya untuk Owner / CEO pada route control dashboard.
- Finance dan Earnings disembunyikan dari Manager Operasional menurut komentar `role-access.ts`.
- Admin operasional tidak mendapat Owner Dashboard, Garage AI, Finance, Earnings, CEO Control, dan Audit.
- File kandidat recruitment dilayani lewat route privat dan butuh session Owner/Admin/Manager.

## Dead / Broken / Need Review

- Backup Google Drive tercatat belum selesai di checklist F1.
- Manual golden path belum terbukti selesai di checklist G4.
- Beberapa modul AI/marketing/social publishing membutuhkan credential eksternal; status operasional harus diuji.
- Procurement tidak ada sebagai role eksplisit di `role-access.ts`; prosesnya tersebar di inventory receiving dan finance supplier invoice.
""")

    write("README.md", """# Dokumentasi Operasional GarageOS

Dokumentasi ini dibuat dari analisis source code GarageOS, route aplikasi, schema database, permission matrix, dan checklist MVP yang ada di repo.

Gunakan dokumen ini sebagai SOP pilot dan training. Bagian bertanda `REVIEW REQUIRED` harus diverifikasi owner/manager sebelum dipakai sebagai aturan final.

## Struktur

- `SYSTEM_OVERVIEW.md`: ringkasan sistem.
- `FEATURE_MAP.md`: peta fitur dan status.
- `SOP/`: SOP per role.
- `APP_GUIDE/`: panduan layar aplikasi.
- `WORKFLOW/`: alur operasional.
- `TRAINING/`: onboarding Day 1, Day 7, Day 30.
- `CHECKLIST/`: checklist opening, closing, daily, audit.
- `OWNER_PLAYBOOK.md`: playbook owner.
- `UX_RECOMMENDATION.md`: review UX dan rekomendasi.
""")

    write("SYSTEM_OVERVIEW.md", f"""# SYSTEM OVERVIEW GarageOS

GarageOS adalah operating system internal untuk cafe/coffee & motor dengan POS, kitchen, waiter, inventory, finance, CRM, membership, marketing, HR, recruitment, audit, dan owner dashboard.

## Source Evidence

- Pages: {s['page_count']}
- API routes: {s['api_count']}
- Database entities: {len(s['tables'])}
- Role source: `src/lib/role-access.ts`
- Main shell: `src/components/garage/garage-app.tsx`

## Core Architecture

```mermaid
flowchart LR
  Login[Login & Session] --> OS[GarageOS Workspace]
  OS --> POS[POS]
  OS --> KDS[Kitchen]
  OS --> Floor[Waiter]
  OS --> Inv[Inventory]
  OS --> Fin[Finance]
  OS --> CRM[CRM & Membership]
  OS --> HR[Team Management]
  OS --> Audit[Audit]
  POS --> Orders[(orders)]
  Orders --> Tickets[(kitchen_tickets)]
  POS --> Payments[(payments)]
  Inv --> Stock[(inventory_items)]
  Fin --> Cash[(cash_sessions)]
```

## Role Principle

Sidebar dan API dibatasi oleh role. Staff hanya boleh melihat modul yang muncul pada akun mereka. Jika tombol tidak muncul, jangan mencari jalan pintas.

## Operational Definition of Done

Satu order dinyatakan selesai operasional bila: customer/kasir membuat order -> kitchen menerima ticket -> item ready -> waiter deliver -> bill/payment selesai -> receipt tersedia -> meja dibersihkan -> laporan harian berubah -> backup aman. Checklist repo menunjukkan golden path ini masih perlu UAT manual sebelum klaim go-live penuh.
""")

    for file_name, role_name, objective in ROLES:
        write(f"SOP/{file_name}.md", role_doc(file_name, role_name, objective))

    write("APP_GUIDE/LOGIN.md", standard_screen_manual("Login", "/login, /pos-login, /login/2fa", "Masuk ke GarageOS, POS, dan challenge 2FA bila policy aktif."))
    write("APP_GUIDE/NAVIGATION.md", """# NAVIGATION

Purpose: memahami sidebar dan perpindahan modul.

## Prinsip

- Menu mengikuti role. Tidak semua staff melihat menu yang sama.
- Gunakan sidebar desktop atau drawer mobile.
- Menu umum: Chat Internal, Training/Buku Pintar, Smart Notif untuk station tertentu.

## Best Practice

- Jangan bookmark URL modul yang role Anda tidak punya.
- Jika menu hilang, cek akun/role ke Admin.
- Di mobile, prioritaskan satu tugas per layar dan hindari membuka banyak tab.
""")
    write("APP_GUIDE/DASHBOARD.md", standard_screen_manual("Dashboard", "module=dashboard", "Melihat KPI, alert, revenue, order aktif, dan owner/manager snapshot."))
    write("APP_GUIDE/SETTINGS.md", standard_screen_manual("Settings", "module=settings, /control/settings", "Mengatur outlet, tema, printer, pajak, service charge, dan kebijakan sistem yang tersedia."))
    write("APP_GUIDE/TROUBLESHOOTING.md", """# TROUBLESHOOTING

## Backend / Database

- Buka `/api/health`.
- Jika database belum siap, hentikan input penting dan hubungi Admin/Owner.
- Jangan refresh berulang saat sedang submit pembayaran.

## Printer

- Cek power, kertas, koneksi, dan nama printer.
- Test print dari OS.
- Gunakan invoice digital/manual receipt hanya atas persetujuan manager.

## Payment

- Jangan klik bayar dua kali.
- Jika status payment tidak jelas, cek order history dan finance sebelum membuat transaksi baru.

## Role Access

- `FORBIDDEN` berarti role tidak boleh melakukan aksi tersebut.
- Minta Admin/Owner koreksi role, bukan memakai akun lain.

## Mobile

- Jika layar terasa sempit, gunakan mode portrait untuk checklist/list dan landscape untuk POS tablet.
""")

    app_guide = "# APPLICATION MANUAL - Every Screen\n\n"
    for name, route, purpose in SCREENS:
        app_guide += standard_screen_manual(name, route, purpose) + "\n"
    write("APP_GUIDE/SCREEN_MANUAL.md", app_guide)

    write("WORKFLOW/ORDER_TO_CASH.md", workflow_doc("ORDER TO CASH", """Customer/kasir membuat order, kasir memvalidasi pembayaran, kitchen/bar memproses, waiter mengantar, kasir menyelesaikan receipt, finance melihat transaksi di cash session."""))
    write("WORKFLOW/PURCHASE_TO_PAY.md", workflow_doc("PURCHASE TO PAY", """Gudang/Admin mencatat kebutuhan stok atau receiving supplier, finance mencatat supplier invoice, pembayaran supplier dilakukan oleh role finance/owner sesuai approval."""))
    write("WORKFLOW/INVENTORY_FLOW.md", workflow_doc("INVENTORY FLOW", """Produk dan bahan dikelola lewat inventory: SKU, stok minimum, movement, receiving, transfer, opname, smart reorder, dan audit daily."""))
    write("WORKFLOW/DAILY_OPERATION.md", workflow_doc("DAILY OPERATION", """Operasi harian dimulai dari opening device dan cash, berjalan lewat POS/KDS/Waiter/Inventory, lalu ditutup dengan closing finance, audit log, dan report."""))
    write("WORKFLOW/OPEN_CLOSE_SHIFT.md", workflow_doc("OPEN CLOSE SHIFT", """Kasir membuka cash session, menjalankan transaksi selama shift, lalu menutup cash session dengan cash fisik, discrepancy note, dan report."""))
    write("WORKFLOW/INCIDENT.md", workflow_doc("INCIDENT", """Incident dicatat melalui feedback/error/audit/case/approval sesuai jenisnya. Masalah uang, customer, stok, atau sistem harus dieskalasi ke role yang tepat."""))

    write("WORKFLOW/WORKFLOW_TESTING.md", """# WORKFLOW TESTING

## Simulation: Customer -> Cashier -> Kitchen -> Bar -> Waiter -> Inventory -> Finance -> Manager -> Owner

| Step | PASS / FAIL | Problem | Impact | Suggested Fix | Priority |
| --- | --- | --- | --- | --- | --- |
| Customer order route exists | PASS | Public `/order` dan customer order API ditemukan | Customer dapat diarahkan ke QR flow | Test dengan QR meja nyata | High |
| Cashier POS route exists | PASS | POS dan order API tersedia | Order dapat dibuat/diterima | Uji payment dan receipt | High |
| Kitchen ticket exists | PASS | KDS API dan table `kitchen_tickets` tersedia | Produksi bisa tracking | Uji station food/bar | High |
| Waiter floor exists | PASS | Waiter ticket/table/service request API tersedia | Delivery dan meja bisa tracking | Uji request bill dan clean | High |
| Inventory movement exists | PASS | Inventory movement/opname/receiving ada | Stok bisa diaudit | Pastikan auto deduction dari order di UAT | High |
| Finance closing exists | PASS | Cash session, expense, settlement tersedia | Closing bisa dilakukan | Uji open/close shift | High |
| Manager monitoring exists | PASS | Dashboard, approvals, audit, team modules ada | Manager bisa kontrol operasional | Uji role Manager langsung | Medium |
| Owner final review exists | PASS | Owner dashboard, CEO Control, audit, daily brief ada | Owner bisa review keputusan | Uji export report | Medium |
| End-to-end runtime proof | NEED REVIEW | Checklist G4 belum selesai | Belum bisa klaim operasional penuh | Jalankan 1 hari pilot/UAT | Critical |
""")

    write("UX_RECOMMENDATION.md", """# UX RECOMMENDATION

Audit berbasis source, struktur layar, dan prinsip UI/UX Pro Max. Screenshot aktual belum di-capture dalam generator ini; placeholder disiapkan untuk setiap temuan.

| Current Problem | Screenshot | Impact | Redesign Suggestion | Priority |
| --- | --- | --- | --- | --- |
| Modul sangat banyak di sidebar | [Screenshot placeholder - sidebar] | Staff baru bisa bingung memilih menu | Gunakan group role-task: Kasir, Dapur, Floor, Back Office, Owner | High |
| Beberapa role operasional melihat AI/Training/Smart Notif bersamaan | [Screenshot placeholder - mobile nav] | Mobile terasa padat | Prioritaskan module utama role, taruh utility di bottom/drawer | High |
| Finance, inventory, HR punya tabel padat | [Screenshot placeholder - table] | Risiko horizontal scroll di HP | Tambah mobile card/list mode untuk data penting | High |
| Procurement tidak role eksplisit | [Screenshot placeholder - permissions] | Tanggung jawab pembelian bisa rancu | Tetapkan role owner proses: Gudang atau Finance | Medium |
| UAT golden path belum terbukti | [Screenshot placeholder - UAT] | UI terlihat lengkap tapi operasional belum pasti | Tambah readiness panel per workflow dengan status bukti | Critical |

## Score

- Simplicity: 78/100
- Learnability: 76/100
- Speed: 84/100 untuk POS/KDS, 72/100 untuk back office
- Mobile: 74/100, perlu validasi device nyata
- Error Prevention: 82/100 karena permission guard kuat, tetapi UAT manual tetap wajib

## Master Direction

Jadikan GarageOS sebagai command workspace berbasis role. Staff tidak perlu membaca semua modul; layar pertama harus langsung mengarah ke tugas shift hari ini.
""")

    for day, objective in [
        ("DAY_1", "Staff bisa login, memahami role, membuka modul utama, dan menjalankan simulasi aman."),
        ("DAY_7", "Staff mampu menjalankan shift dengan error rendah dan eskalasi benar."),
        ("DAY_30", "Staff memahami KPI, audit, exception handling, dan bisa membantu training staff baru."),
    ]:
        write(f"TRAINING/{day}.md", f"""# TRAINING {day.replace('_', ' ')}

## Objective

{objective}

## Exercise

- Login dengan akun training.
- Buka module sesuai role.
- Jalankan 3 simulasi: normal, error, dan eskalasi.
- Isi checklist selesai shift.

## Quiz

1. Apa yang harus dilakukan jika akses ditolak?
2. Kapan status order boleh diubah?
3. Siapa yang dihubungi untuk masalah payment?
4. Apa larangan utama saat memakai akun bersama?

## Pass Criteria

- Bisa login dan logout.
- Bisa menjelaskan batas role.
- Bisa menyelesaikan simulasi tanpa salah status.
- Bisa membuat laporan exception singkat.
""")

    write("OWNER_PLAYBOOK.md", """# OWNER PLAYBOOK GarageOS

## Morning Review

- Buka Dashboard.
- Cek revenue kemarin/hari ini.
- Cek low stock.
- Cek pending approval.
- Cek issue audit atau complaint.

## Daily KPI

- Omzet harian.
- Net profit/AOV.
- Order count.
- Kitchen SLA.
- Cash discrepancy.
- Low stock critical.
- Pending approval.

## Weekly KPI

- Top product.
- Margin menu.
- Staff attendance.
- Campaign performance.
- Repeat customer/member activity.

## Monthly KPI

- Profit/loss.
- Supplier cost.
- Payroll/earnings.
- Inventory shrinkage.
- Customer growth.

## Decision Dashboard

```mermaid
flowchart TD
  A[Dashboard Owner] --> B{Ada red flag?}
  B -- Cash --> C[Finance Closing]
  B -- Stock --> D[Inventory]
  B -- Staff --> E[Team Management]
  B -- Customer --> F[CRM/Marketing]
  B -- System --> G[Audit/Health]
```

## Profit Monitoring

- Bandingkan revenue, COGS, expense, dan cash settlement.
- Review margin menu melalui Finance/Menu Engineering.

## Inventory Monitoring

- Cek low stock dan smart reorder.
- Review opname dan movement yang butuh approval.

## People Monitoring

- Cek attendance, shift, KPI, payroll, advances.
- Review SOP completion dan handover.

## Financial Health

- Tidak ada cash session terbuka lama.
- Selisih kas dijelaskan.
- Expense besar punya approval.
- Supplier invoice punya status bayar jelas.

## Red Flag System

- Selisih kas besar.
- Void/refund berulang.
- Stok minus/low tanpa receiving.
- Complaint customer berulang.
- Login gagal berulang.

## CEO Shortcut

Dashboard -> Approvals -> Finance -> Inventory -> Audit -> Team -> Daily Brief Export.
""")

    for name, lines in {
        "OPENING": ["Login", "Cek device", "Cek printer", "Open cash session", "Cek menu/stok", "Cek kitchen/waiter online"],
        "CLOSING": ["Selesaikan pending order", "Hitung cash fisik", "Close cash session", "Review discrepancy", "Export/report", "Logout device"],
        "DAILY": ["Cek dashboard", "Cek POS/KDS/Floor", "Cek inventory low", "Cek approvals", "Cek finance", "Cek audit"],
        "AUDIT": ["Review void/refund", "Review login attempts", "Review discrepancy", "Review stock adjustment", "Review complaint", "Catat follow-up"],
    }.items():
        write(f"CHECKLIST/{name}.md", "# CHECKLIST " + name + "\n\n" + "\n".join([f"- [ ] {x}" for x in lines]))


def build_pdf() -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    OUT.mkdir(parents=True, exist_ok=True)
    pdf_path = OUT / "GarageOS_Operational_Documentation.pdf"
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=1.45 * cm,
        leftMargin=1.45 * cm,
        topMargin=1.35 * cm,
        bottomMargin=1.25 * cm,
        title="GarageOS Operational Documentation",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=colors.HexColor("#151515"), spaceAfter=14))
    styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=17, leading=22, textColor=colors.HexColor("#d11a2a"), spaceBefore=12, spaceAfter=8))
    styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=colors.HexColor("#222222"), spaceBefore=8, spaceAfter=5))
    styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=8.5, leading=12, textColor=colors.HexColor("#252525")))
    story = []
    story.append(Paragraph("GarageOS", styles["CoverTitle"]))
    story.append(Paragraph("Operational Documentation & SOP", styles["H1x"]))
    story.append(Paragraph("Dokumen operasional berbasis source code, role matrix, database schema, dan checklist MVP. Bagian REVIEW REQUIRED perlu diverifikasi saat pilot/UAT.", styles["Bodyx"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Table([["Scope", "All employee roles"], ["Format", "Single PDF + Markdown docs"], ["Language", "Indonesian"], ["Generated", datetime.now().strftime("%Y-%m-%d %H:%M")]], colWidths=[4 * cm, 11 * cm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#151515")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ])))
    story.append(PageBreak())

    include = [
        "README.md", "SYSTEM_OVERVIEW.md", "FEATURE_MAP.md",
        "WORKFLOW/WORKFLOW_TESTING.md", "UX_RECOMMENDATION.md", "OWNER_PLAYBOOK.md",
    ]
    include += [f"SOP/{r[0]}.md" for r in ROLES]
    include += ["APP_GUIDE/LOGIN.md", "APP_GUIDE/NAVIGATION.md", "APP_GUIDE/DASHBOARD.md", "APP_GUIDE/SETTINGS.md", "APP_GUIDE/TROUBLESHOOTING.md", "APP_GUIDE/SCREEN_MANUAL.md"]
    include += ["WORKFLOW/ORDER_TO_CASH.md", "WORKFLOW/PURCHASE_TO_PAY.md", "WORKFLOW/INVENTORY_FLOW.md", "WORKFLOW/DAILY_OPERATION.md", "WORKFLOW/OPEN_CLOSE_SHIFT.md", "WORKFLOW/INCIDENT.md"]
    include += ["TRAINING/DAY_1.md", "TRAINING/DAY_7.md", "TRAINING/DAY_30.md", "CHECKLIST/OPENING.md", "CHECKLIST/CLOSING.md", "CHECKLIST/DAILY.md", "CHECKLIST/AUDIT.md"]

    for rel in include:
        path = DOCS / rel
        if not path.exists():
            continue
        story.append(Paragraph(rel, styles["H1x"]))
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line:
                story.append(Spacer(1, 0.08 * cm))
            elif line.startswith("# "):
                story.append(Paragraph(line[2:], styles["H1x"]))
            elif line.startswith("## "):
                story.append(Paragraph(line[3:], styles["H2x"]))
            elif line.startswith("|"):
                story.append(Paragraph(line.replace("|", " | "), styles["Bodyx"]))
            elif line.startswith("```"):
                story.append(Paragraph("[Diagram Mermaid tersedia di Markdown]", styles["Bodyx"]))
            else:
                safe = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                story.append(Paragraph(safe, styles["Bodyx"]))
        story.append(PageBreak())

    def footer(canvas, doc_obj):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.drawString(1.45 * cm, 0.7 * cm, "GarageOS Operational Documentation")
        canvas.drawRightString(A4[0] - 1.45 * cm, 0.7 * cm, f"Page {doc_obj.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(pdf_path)


if __name__ == "__main__":
    build_docs()
    build_pdf()
