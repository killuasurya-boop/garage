# GARAGE POS + QR Menu V1 LAN Runbook

## Target

V1 siap dipakai di outlet LAN: customer scan QR meja, checkout Guest atau Member, kasir validasi order, kitchen menerima ticket setelah `Accept` atau `Paid`, dan invoice WhatsApp memakai Cloud API bila credential tersedia dengan fallback `wa.me`.

## Environment

Isi `.env` dari `.env.example`.

- `DATABASE_URL`: database outlet.
- `BETTER_AUTH_URL`: URL aplikasi, contoh `http://192.168.1.19:3001`.
- `GARAGE_TRUSTED_ORIGINS`: semua origin lokal yang boleh login.
- `GARAGE_PUBLIC_BASE_URL`: base URL LAN untuk QR dan invoice.
- `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL`: base URL LAN yang dipakai UI kasir.
- `WHATSAPP_CLOUD_API_TOKEN`: token WhatsApp Cloud API, boleh kosong untuk fallback `wa.me`.
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`: phone number id Cloud API.
- `WHATSAPP_CLOUD_TEMPLATE_NAME`: optional, isi jika memakai approved template.

## Setup Baru

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run build
```

Akun seed default:

- Kasir: `kasir@garage.local` / `garage12345`
- Owner: `owner@garage.local` / `garage12345`
- Member test: `081300001001` / `member12345`

## Start LAN Outlet

Cari IP komputer kasir:

```powershell
ipconfig
```

Set `.env` agar URL LAN konsisten. Untuk outlet saat ini gunakan IP `192.168.110.142`:

```env
BETTER_AUTH_URL="http://192.168.110.142:3001"
GARAGE_TRUSTED_ORIGINS="http://localhost:3001,http://127.0.0.1:3001,http://192.168.110.142:3001"
GARAGE_PUBLIC_BASE_URL="http://192.168.110.142:3001"
NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL="http://192.168.110.142:3001"
```

Jalankan aplikasi:

```powershell
npm.cmd run build
npm.cmd run start -- --hostname 0.0.0.0
```

Untuk development LAN:

```powershell
npm.cmd run dev:lan
```

## Print QR 50 Meja

1. Login kasir ke `/pos`.
2. Buka panel `Incoming QR Orders`.
3. Klik `QR Meja`.
4. Untuk UAT pilot, klik `Print Pilot` atau buka `/order/qr-print?tables=01,25,50`.
5. Setelah pilot lolos, klik `Print 50 QR` atau buka `/order/qr-print`.
6. Print halaman tersebut. Pastikan setiap QR mengarah ke `http://192.168.x.x:3001/order?table=XX&source=qr_table`.

Panduan operator untuk pilot 3 meja:

```powershell
npm.cmd run pilot:uat
```

Panduan operator untuk rollout semua meja setelah pilot lolos:

```powershell
npm.cmd run pilot:uat -- --rollout
```

## Flow Operasional

1. Customer scan QR meja.
2. Customer pilih menu, tambah item, lalu checkout.
3. Guest wajib isi nama dan nomor WhatsApp.
4. Member login dari QR akan kembali ke meja yang sama via parameter `next`.
5. Order masuk ke POS dengan status `pending_cashier`.
6. Kasir buka detail order, cek meja/customer/item/total.
7. Kasir pilih:
   - `Accept`: membuat kitchen ticket, pembayaran menyusul.
   - `Paid`: membuat kitchen ticket dan mencatat pembayaran manual kasir.
   - `Reject`: tidak membuat kitchen ticket dan masuk audit log.
8. Pantau tab `Table Map` untuk melihat status meja `01-50` secara live.
9. Jika order sudah masuk kitchen, customer dapat melihat status dari halaman `/order` dan TV dapat membuka `/display/customer-queue`.
10. Print queue dibuat otomatis:
    - `Accept` atau `Paid`: kitchen ticket.
    - `Paid`: receipt.
11. Jika resep bahan sudah diisi di `menu_recipes`, stok bahan otomatis berkurang sekali setelah order QR valid.

## MVP-2 Control + Retention

- POS QR area memakai tab `Incoming`, `Table Map`, `QR Control`, `Follow-up`, dan `QR Meja`.
- Customer `/order` punya tombol scroll-up, checkout sheet, voucher code opsional, dan polling status order publik.
- Voucher dapat dibuat lewat endpoint owner/kasir berizin `/api/vouchers`; customer mengecek voucher lewat `/api/vouchers/validate`.
- Customer display publik tersedia di `/display/customer-queue` dan tidak mengembalikan nama/nomor WhatsApp.
- Shift handover tersimpan lewat `/api/shift/handover` untuk ringkasan QR, kitchen delay, stock warning, dan cash session.
- Print jobs tersedia lewat `/api/print-jobs` untuk browser print receipt dan kitchen ticket.

## WhatsApp Invoice

- Tanpa credential Cloud API: sistem menyimpan link `wa.me`.
- Dengan credential Cloud API valid: sistem mencoba kirim invoice otomatis dan status menjadi `sent`.
- Jika Cloud API gagal: status menjadi `failed`, tetapi link `wa.me` tetap tersedia untuk dikirim manual.
- MVP-2 QR Control menampilkan template follow-up manual: receipt, promo next visit, review Google, dan ajakan daftar member.

Catatan produksi: untuk pesan outbound yang tidak berada dalam customer service window, gunakan `WHATSAPP_CLOUD_TEMPLATE_NAME` dengan approved template.

Set `GARAGE_GOOGLE_REVIEW_URL` jika outlet sudah punya link review Google resmi.

## Smoke Test

Pastikan server sedang berjalan, lalu:

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"
npm.cmd run smoke
npm.cmd run readiness:audit
```

Smoke test mengecek:

- health DB reachable
- menu API
- endpoint kasir 401 tanpa login
- login kasir dan endpoint kasir 200
- live table map 50 meja
- public customer display tanpa data sensitif
- voucher validate fallback
- print queue endpoint
- public status order customer
- guest QR order create lalu reject
- member login/profile/QR order create lalu reject

Order QA selalu direject otomatis agar tidak mengotori antrean operasional.

Audit readiness lengkap ada di `docs/garage-production-readiness-audit.md`.
SOP kasir QR order ada di `docs/garage-qr-cashier-sop.md`.
Checklist pilot dan rollout ada di `docs/garage-pilot-uat-rollout.md`.

## UAT Checklist

- Mobile 360px: `/order?table=01&source=qr_table`, tambah menu, checkout Guest, validasi WhatsApp, success menunggu kasir.
- Mobile Member: login dari `/order`, kembali otomatis ke meja yang sama, checkout sebagai member.
- POS tablet: Incoming QR Orders tampil compact, meja besar terbaca, detail drawer terbuka.
- POS QR Control: total QR, paid, average proses, SLA >3m, meja aktif, reject reason, dan repeat customer terbaca.
- Reject: order hilang dari pending, tidak membuat kitchen ticket, audit log tercatat.
- Accept: kitchen ticket muncul.
- Paid: kitchen ticket muncul, payment tercatat, points member diproses jika akun member.
- QR 50 meja: meja `01` sampai `50` membuka table yang benar.
- WhatsApp tanpa env: link `wa.me` muncul.
- WhatsApp dengan env valid: status invoice berubah `sent`.

## Follow-up Dependency

Jangan menjalankan `npm audit fix --force` untuk V1 karena dapat memaksa breaking downgrade. Catat dependency audit sebagai follow-up terpisah setelah UAT outlet selesai.
