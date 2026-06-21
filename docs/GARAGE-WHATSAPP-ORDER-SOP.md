# GARAGE WhatsApp Order SOP

Dokumen ini dipakai untuk menangani order dari landing page, Google Maps, Instagram, dan WhatsApp Business. Tujuannya: customer cepat dibalas, order tidak hilang, kasir tetap punya kontrol, dan data harian bisa dihitung.

## 1. Prinsip Utama

- WhatsApp adalah channel order, bukan catatan transaksi final.
- Semua order valid harus masuk POS atau dicatat kasir sesuai SOP outlet.
- Jangan produksi order sebelum item, total, nama, metode ambil, dan pembayaran jelas.
- Jangan menjanjikan stok/menu/promo yang belum dikonfirmasi.
- Saat ramai, gunakan template singkat agar respons tetap cepat.

## 2. SLA Respons

| Kondisi | Target Respons | Owner |
| --- | --- | --- |
| Jam buka normal | < 3 menit | Kasir/Marketing shift |
| Jam ramai | < 5 menit | Kasir utama |
| Di luar jam buka | Auto-reply langsung | WhatsApp Business |
| Komplain P1/P2 | < 10 menit | Manager/Owner |
| Refund/void | < 15 menit untuk acknowledgement | Manager/Owner |

## 3. Setup WhatsApp Business

- [ ] Nama profil: `GARAGE Coffee`.
- [ ] Foto profil memakai logo/aset resmi GARAGE.
- [ ] Deskripsi singkat berisi positioning dan lokasi.
- [ ] Alamat sesuai Google Maps.
- [ ] Jam buka sesuai operasional final.
- [ ] Link landing page aktif.
- [ ] Katalog berisi menu signature dan paket promo yang sudah final.
- [ ] Label chat dibuat:
  - `New Order`
  - `Waiting Payment`
  - `Paid`
  - `Preparing`
  - `Ready`
  - `Done`
  - `Complaint`
  - `Need Owner`

## 4. Template Auto-Reply

### Greeting Jam Buka

```txt
Halo, terima kasih sudah menghubungi GARAGE Coffee.

Untuk order, kirim format ini:
Nama:
Order:
Dine-in/Takeaway:
Jam ambil:
Metode bayar:
Catatan:

Tim kami akan konfirmasi total dan estimasi waktu.
```

### Di Luar Jam Buka

```txt
Halo, GARAGE Coffee sedang di luar jam operasional.

Jam buka:
{jam buka final}

Kamu tetap bisa kirim order atau pertanyaan di sini. Tim kami akan membalas saat operasional dimulai.
```

### Link dari Landing Page

```txt
Halo GARAGE, saya datang dari website dan mau pesan:

Nama:
Order:
Dine-in/Takeaway:
Jam ambil:
Catatan:
```

## 5. Flow Order WhatsApp

### Step 1: Terima Order

- [ ] Balas customer dengan greeting jika format belum lengkap.
- [ ] Cek nama customer.
- [ ] Cek item dan jumlah.
- [ ] Cek dine-in/takeaway.
- [ ] Cek jam ambil jika takeaway.
- [ ] Cek catatan alergi/request khusus.
- [ ] Cek promo jika customer menyebut promo.

### Step 2: Validasi Menu dan Harga

- [ ] Pastikan menu tersedia.
- [ ] Pastikan harga sesuai POS/menu final.
- [ ] Jika item kosong, tawarkan alternatif.
- [ ] Jika promo tidak berlaku, jelaskan singkat tanpa debat.
- [ ] Hitung total final.

Template konfirmasi total:

```txt
Order kamu:
{item + qty}

Total: Rp {total}
Estimasi siap: {estimasi}
Metode: {dine-in/takeaway}

Konfirmasi ya, setelah itu kami proses.
```

### Step 3: Input ke POS

- [ ] Kasir input order ke POS sebagai channel `WA` jika tersedia.
- [ ] Jika channel belum tersedia, catat di catatan order: `WA - {nama customer}`.
- [ ] Jika payment belum diterima, status order jangan dianggap paid.
- [ ] Jika order harus masuk kitchen, pastikan ticket terbentuk sesuai SOP POS.

### Step 4: Payment

Untuk cash saat pickup/dine-in:

```txt
Siap. Order kami proses, pembayaran bisa dilakukan saat ambil/datang ke kasir.
```

Untuk transfer/QRIS/manual:

```txt
Silakan pembayaran ke:
{metode pembayaran}

Setelah transfer, kirim bukti pembayaran di chat ini ya.
Order diproses setelah pembayaran kami konfirmasi.
```

Setelah bukti masuk:

- [ ] Cek nominal.
- [ ] Cek nama/referensi jika ada.
- [ ] Tandai payment sesuai SOP kasir.
- [ ] Balas customer.

Template pembayaran diterima:

```txt
Pembayaran sudah kami terima.

Order sedang diproses.
Estimasi siap: {estimasi}
```

### Step 5: Ready dan Pickup

```txt
Order atas nama {nama} sudah siap.

Silakan ambil di kasir GARAGE.
Tunjukkan chat ini saat pickup.
```

### Step 6: Closing Chat

```txt
Terima kasih sudah order di GARAGE Coffee.

Kalau pengalaman kamu oke, bantu kami dengan review di Google Maps:
{link maps}
```

## 6. Flow Komplain

Komplain tidak boleh dibalas defensif. Fokus: terima, cek fakta, selesaikan.

### Klasifikasi

| Severity | Contoh | Owner | Target |
| --- | --- | --- | --- |
| P0 | Isu keamanan makanan, customer marah di outlet | Owner/Manager | Tangani langsung |
| P1 | Order salah, payment bermasalah, customer belum menerima order | Manager/Kasir | Solusi < 30 menit |
| P2 | Rasa tidak sesuai, delay, item kurang | Kasir/Manager | Solusi di shift yang sama |
| P3 | Kritik layanan, saran, pertanyaan umum | Marketing/Kasir | Balas sopan |

### Template Acknowledgement

```txt
Mohon maaf atas pengalaman ini.

Kami cek dulu detail ordernya ya:
Nama:
Waktu order:
Item:
Masalah:

Tim kami akan bantu cari solusi.
```

### Template Solusi Order Salah / Item Kurang

```txt
Terima kasih sudah menunggu.

Kami bisa bantu dengan:
1. Ganti item yang sesuai, atau
2. Refund/adjustment sesuai approval manager.

Mana yang paling nyaman untuk kamu?
```

### Template Delay

```txt
Mohon maaf order kamu lebih lama dari estimasi.

Status sekarang: {status}
Estimasi terbaru: {estimasi}

Kami prioritaskan agar segera selesai.
```

### Setelah Selesai

- [ ] Catat issue di `docs/PILOT-ISSUE-LOG.md` jika terjadi saat pilot/soft launch.
- [ ] Tandai chat `Complaint`.
- [ ] Jika ada refund/void, ikuti approval manager/owner.
- [ ] Review penyebab di akhir shift.

## 7. Broadcast dan WhatsApp Status

Broadcast hanya boleh ke customer yang memberi izin atau sudah menjadi kontak aktif sesuai aturan bisnis.

- [ ] Jangan kirim spam harian.
- [ ] Maksimal 1-2 broadcast per minggu.
- [ ] Hanya promosikan menu/promo yang siap di POS.
- [ ] Selalu beri CTA jelas.
- [ ] Jangan gunakan klaim palsu seperti paling murah/terbaik jika tidak punya bukti.

Template broadcast promo:

```txt
GARAGE Coffee update:

{nama promo/menu}
{deskripsi singkat}
Berlaku: {tanggal/jam}

Order via WA atau mampir langsung:
{link maps}
```

## 8. Daily WA Report

Isi setiap closing.

| Tanggal | Chat Masuk | Order WA | Paid | Cancel | Komplain | Menu Terlaris | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## 9. Go / No-Go WA

GO jika:

- [ ] WA Business lengkap.
- [ ] Template greeting/order/payment/ready/komplain siap.
- [ ] Staff tahu siapa yang membalas chat.
- [ ] Order WA bisa masuk POS atau dicatat kasir dengan rapi.
- [ ] Payment manual punya SOP.
- [ ] Komplain punya owner.

NO-GO jika:

- [ ] Tidak ada staff yang bertanggung jawab saat jam buka.
- [ ] Harga/menu WA beda dengan POS.
- [ ] Customer bisa bayar tapi order tidak tercatat.
- [ ] Komplain tidak punya owner.
- [ ] Landing page mengarah ke nomor WA yang belum siap.

## 10. Rujukan

- `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md`
- `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md`
- `docs/SOP-FINAL-OPERASIONAL-GARAGE.md`
- `docs/PILOT-ISSUE-LOG.md`
