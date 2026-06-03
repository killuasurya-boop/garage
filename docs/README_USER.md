# Garage Coffee & Motor OS — Panduan User

Selamat datang di **Garage OS**. Sistem operasional internal untuk POS, kitchen, inventory, finance, dan command center owner.

---

## Login

1. Buka `https://app.garage.local/login` (atau IP server lokal Anda)
2. Email + password sesuai role
3. Tombol **"ISI DEMO"** otomatis mengisi kredensial role yang dipilih (untuk training)

### Role yang tersedia

| Role | Akses utama |
|---|---|
| **Owner / CEO** | Semua modul + `/control` (command center) |
| **Admin** | Semua modul operasional + admin user/setting |
| **Manager Operasional** | Operasional + finance, approve |
| **Kasir** | POS, sales-history |
| **Barista** / **Koki** / **Asisten Koki** | Kitchen Display (KDS) |
| **Waiter 1/2** | Tickets ready, deliver |
| **Gudang** | Inventory, opname, transfer |
| **Finance/CFO** | Finance, cash closing, anomaly |
| **Supervisor Shift** | POS + closing |

---

## Alur kerja harian — Kasir

1. Login `/pos-login` (atau `/pos` setelah `/login`)
2. Buka shift di tombol **"Mulai Shift"** (set opening cash)
3. **Buat order**: pilih item → tambah ke cart → "Bayar"
4. Pilih metode pembayaran (Cash / QRIS / Transfer / E-Wallet / **Split**)
5. Print receipt
6. Akhir shift: **"Tutup Shift"** — hitung kas fisik
   - Selisih > Rp50.000 → masuk ke Approval Board, manager sign-off

### Split payment (1 order, 2+ metode)

Pilih **"Split"** di payment panel:
- Tambah baris per metode (Cash + QRIS)
- Sum **wajib = total order** (warna merah kalau tidak)
- Submit → 2 row di finance, audit log mencatat

### Tampilan customer (layar kedua)

Klik **"Layar Customer"** di QRIS panel → buka tab/window untuk monitor menghadap pelanggan dengan QR + nominal besar.

---

## Alur kerja harian — Kitchen (KDS)

1. Login sebagai Koki/Barista
2. Buka modul **Kitchen**
3. Order baru otomatis muncul (polling 5–8s)
4. Klik kartu → status `cooking`
5. Selesai → tombol `ready` → ke Waiter

---

## Alur kerja harian — Waiter

1. Login sebagai Waiter
2. Tickets yang `ready` muncul
3. Tap **Delivered** setelah antar ke meja

---

## Member & Point

- Customer beli sambil sebut HP → kasir input phone
- Point earn otomatis (~10 poin per Rp10.000)
- Redeem reward di POS (lihat panel Member)

---

## Tips

- **Browser**: Chrome/Edge terbaru
- **Tablet POS**: refresh pakai `Ctrl+Shift+R` setelah update sistem
- **Hilang koneksi?** Order tetap tersimpan di local queue, sync otomatis saat online (banner kuning muncul)
- **Lupa password?** Hubungi Admin (rate-limit 5x/menit untuk reset)

---

## Bantuan

Hubungi Admin atau lihat `docs/README_ADMIN.md` untuk troubleshooting.
