# Link Kampanye & Sosmed — Garage Coffee & Motor

Setiap order yang masuk lewat link di bawah tercatat sumbernya dan muncul di
**Marketing → Overview → "Order per sumber (30 hari)"**.

Ganti `DOMAIN` dengan alamat website: sekarang `http://192.168.100.33:3001` (LAN), nanti `https://app.garagecoffee.id`.

## Link bio (tempel di profil)
| Platform | Link |
|---|---|
| Instagram (bio) | `DOMAIN/order?source=instagram&campaign=bio_ig` |
| TikTok (bio) | `DOMAIN/order?source=campaign&campaign=bio_tiktok` |
| Facebook (bio) | `DOMAIN/order?source=campaign&campaign=bio_fb` |
| YouTube (deskripsi) | `DOMAIN/order?source=campaign&campaign=bio_yt` |

## Link postingan / promo tertentu
Tambahkan `campaign` sesuai nama promo (huruf kecil, pakai `_`):
- Story promo Senin: `DOMAIN/order?source=instagram&campaign=story_promo_senin`
- Video TikTok menu baru: `DOMAIN/order?source=campaign&campaign=tt_spanish_latte`

Link langsung ke item menu tertentu, dengan menu digital langsung menyaring item itu:
`DOMAIN/order?source=campaign&campaign=tt_spanish_latte&q=Spanish Latte`

Pendek juga bisa: `DOMAIN/order?src=ig` → tercatat sebagai `ig`. Parameter `utm_source`/`utm_campaign` dari iklan juga dibaca otomatis.

## Sumber otomatis dari website
| Kode | Dari mana |
|---|---|
| `landing_menu` | kartu menu di website |
| `landing_unggulan` | kartu Menu Unggulan |
| `landing_promo` | kartu Promo |
| `landing_table_check` | panel Cek Meja |
| `mobile_bar` | bar "Menu & Pesan" di HP |
| `mobile_bar_takeaway` | bar HP saat meja penuh ("Pesan Takeaway") |
| (tanpa sumber) | QR meja / pesanan kasir |

## Feed sosmed di website
Modul **Website → Feed Sosmed Landing**: tempel maksimal 6 link video/foto terbaru (Instagram, TikTok, YouTube, Facebook). Link harus `https` dan berasal dari platform yang dipilih.
