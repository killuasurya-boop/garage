# GARAGE Promo Profit Worksheet

Worksheet ini dipakai sebelum promo GARAGE dipublikasikan di landing page, WhatsApp, Google Maps, Instagram, atau POS. Promo hanya boleh live jika margin aman, staff paham, dan POS bisa mencatatnya.

## 1. Prinsip Promo

- Promo harus menaikkan order, repeat, atau review, bukan hanya membuat ramai.
- Harga promo wajib dihitung dari HPP/base cost, bukan feeling.
- Promo harus punya tanggal mulai, tanggal selesai, channel, limit, dan owner.
- Promo harus bisa dijelaskan kasir dalam 10 detik.
- Promo yang tidak bisa dicatat di POS tidak boleh dipublikasikan besar.
- Jika stok/menu tidak aman, promo ditunda.

## 2. Rumus Dasar

Gunakan Rupiah.

```txt
Gross Margin = Harga Jual - HPP
Gross Margin % = Gross Margin / Harga Jual x 100
Promo Margin = Harga Promo - HPP
Promo Margin % = Promo Margin / Harga Promo x 100
Diskon % = (Harga Normal - Harga Promo) / Harga Normal x 100
```

Batas awal yang disarankan:

- [ ] Minuman coffee/non-coffee: margin promo minimal 55%.
- [ ] Food/snack: margin promo minimal 35-45%, tergantung HPP.
- [ ] Bundle: margin total minimal 45%.
- [ ] Voucher repeat: diskon maksimal mengikuti setting `voucherMaxDiscountPct` dan approval owner.
- [ ] Promo rugi hanya boleh untuk campaign khusus dengan limit jelas dan approval owner tertulis.

## 3. Signature Menu Selection

Pilih 3 menu yang akan menjadi wajah campaign.

| Menu | Kategori | Harga Normal | HPP/Base Cost | Margin % | Stok Aman? | Foto Siap? | Cocok Dipromosikan? | Catatan |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| Signature 1 |  |  |  |  |  |  |  |  |
| Signature 2 |  |  |  |  |  |  |  |  |
| Signature 3 |  |  |  |  |  |  |  |  |

Checklist pemilihan:

- [ ] Rasanya konsisten dibuat semua shift.
- [ ] Bahan mudah tersedia.
- [ ] HPP sudah diketahui.
- [ ] Margin sehat.
- [ ] Foto produk bagus.
- [ ] Nama mudah diingat.
- [ ] Staff bisa menjelaskan menu.
- [ ] Tersedia di POS dan menu publik.

## 4. Promo Candidate Sheet

| Promo | Tujuan | Item | Harga Normal | Harga Promo | HPP Total | Promo Margin % | Channel | Periode | Limit | Owner | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Morning Set | Transaksi pagi | Coffee + snack |  |  |  |  | WA, Maps, IG |  |  | Owner | Draft |
| Work Break Set | Lunch/work spot | Coffee + light meal |  |  |  |  | Landing, WA, IG |  |  | Owner | Draft |
| Signature Trio | Product discovery | 3 signature menu |  |  |  |  | Landing, IG |  |  | Owner | Draft |
| Repeat Reward | Repeat customer | Stamp/voucher |  |  |  |  | WA, kasir |  |  | Owner | Draft |

Status:

- `Draft`: ide belum dihitung.
- `Margin OK`: margin aman, belum diuji POS.
- `POS Ready`: bisa diinput/dipakai di POS.
- `Staff Ready`: staff sudah briefing.
- `Live`: boleh dipublikasikan.
- `Stop`: dihentikan karena margin/stok/operasional.

## 5. Approval Gate

Sebelum promo live:

- [ ] Owner menyetujui tujuan promo.
- [ ] Harga normal dan harga promo final.
- [ ] HPP/base cost final.
- [ ] Margin promo dihitung.
- [ ] Stok bahan cukup.
- [ ] POS bisa input promo/voucher/harga promo.
- [ ] Kasir tahu cara menjelaskan promo.
- [ ] Kitchen/barista tahu item promo.
- [ ] Landing page/WA/Maps/IG memakai copy yang sama.
- [ ] Tanggal mulai dan selesai jelas.
- [ ] Limit per customer/hari jelas.

## 6. Promo Copy Bank

### Morning Set

```txt
Morning Set GARAGE
{coffee} + {snack}

Berlaku: {jam/tanggal}
Harga: Rp {harga}

Cocok untuk ngopi pagi atau takeaway sebelum aktivitas.
```

### Work Break Set

```txt
Work Break Set
{drink} + {food}

Untuk kamu yang butuh ngopi, makan ringan, dan kerja sebentar di GARAGE.
```

### Signature Trio

```txt
Coba 3 signature GARAGE:
1. {menu 1}
2. {menu 2}
3. {menu 3}

Lihat menu dan pesan via WhatsApp.
```

### Repeat Reward

```txt
Repeat Reward GARAGE

Kumpulkan {jumlah} transaksi dan dapatkan {reward}.
Tanya kasir untuk detailnya.
```

## 7. POS dan Voucher Check

Rujukan app:

- Product promo menggunakan `promoActive` dan `promoPrice`.
- Variant punya `price` dan `baseCost`.
- Voucher tersedia di modul voucher dan endpoint validasi.
- Finance punya margin/recipe cost view.

Checklist POS:

- [ ] Produk promo punya harga normal final.
- [ ] Produk promo punya HPP/base cost final.
- [ ] Jika memakai promo price, `promoActive` benar.
- [ ] Jika memakai voucher, kode voucher dibuat.
- [ ] Voucher punya periode dan audience jelas.
- [ ] Voucher test validasi berhasil.
- [ ] Order promo muncul di report/finance.
- [ ] Diskon tidak melewati batas setting.

## 8. Daily Promo Review

Isi selama promo berjalan.

| Tanggal | Promo | Terjual | Omzet Promo | Est. Gross Profit | Komplain | Stok Aman? | Keputusan |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
|  |  |  |  |  |  |  |  |

Keputusan harian:

- `Continue`: margin dan operasional aman.
- `Adjust`: perlu ubah copy, jam, limit, atau harga.
- `Stop`: margin buruk, stok bermasalah, atau staff kewalahan.

## 9. Go / No-Go Promo

GO jika:

- [ ] Margin promo aman.
- [ ] Stok aman.
- [ ] POS siap.
- [ ] Staff siap.
- [ ] Copy campaign konsisten.
- [ ] Owner approve.
- [ ] Cara mengukur hasil jelas.

NO-GO jika:

- [ ] HPP/base cost belum jelas.
- [ ] Harga promo membuat margin tidak aman.
- [ ] Promo tidak bisa dicatat di POS.
- [ ] Staff belum tahu aturan promo.
- [ ] Stok bahan tidak aman.
- [ ] Periode/limit tidak jelas.

## 10. Rujukan

- `docs/GARAGE-OPERATIONAL-MARKETING-CHECKLIST.md`
- `docs/GARAGE-MARKETING-30-DAY-CONTENT-CALENDAR.md`
- `docs/GARAGE-WHATSAPP-ORDER-SOP.md`
- `docs/GARAGE-GOOGLE-MAPS-LOCAL-SEO-CHECKLIST.md`
- `docs/FITUR-PENGATURAN-MVP-MASTER.md`
