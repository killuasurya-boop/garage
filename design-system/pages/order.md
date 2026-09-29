# Menu Digital QR (`/order`) — Page Rules

> Override MASTER.md untuk halaman pelanggan `/order` ([src/app/order/page.tsx](../../src/app/order/page.tsx) → [member-order-page.tsx](../../src/components/garage/member-order-page.tsx) + komponen di [src/components/garage/order/](../../src/components/garage/order/)).
> Redesign 2026-09-29: dari grid kartu bergambar → **list ringkas + foto opsional** (gaya aplikasi pesan-antar).

---

## 1. Tujuan halaman

Pelanggan scan QR di meja → pilih menu → kirim ke kasir. Urutan prioritas:
1. **Menu terlihat di layar pertama** (tanpa hero besar).
2. Harga & varian jelas, tombol tambah mudah dijangkau.
3. Keranjang & checkout selalu reachable.
4. Sekunder: bantuan meja (panggil pelayan, bill, chat kasir), status pesanan.

## 2. Struktur (urutan render)

| # | Bagian | Komponen |
|---|---|---|
| 1 | Header satu baris: logo, badge MEJA, tombol Bantuan (dine-in), Login | `order-header.tsx` |
| 2 | Judul "Pesan dari Meja NN" + strip info (ETA, metode bayar, rute) | `order-header.tsx` |
| 3 | Banner campaign `landing_menu` (tipis, 1 baris) | `member-order-page.tsx` |
| 4 | Kartu status pesanan / tracker (bila ada) | `OrderTracker` |
| 5 | Bar sticky: search + tab kategori (scroll-spy) | `category-nav.tsx` |
| 6 | Rail "Terlaris" (maks 6, statis) | `best-seller-rail.tsx` |
| 7 | Seksi kategori → sub-seksi (`section`) → `MenuRow` | `menu-section-list.tsx`, `menu-row.tsx` |
| 8 | Desktop: aside "Pesanan Anda" sticky · Mobile: bar keranjang fixed | `order-cart-bar.tsx` |
| 9 | Sheet: detail varian, bantuan meja, checkout 3 langkah | `MenuDetailSheet`, `order-help-sheet.tsx` |

## 3. Visual

- **Token saja** — utilitas `bg-garage-*`, `text-garage-*`, `border-garage-*` (alias `@theme` di `globals.css`). Jangan hex literal baru.
- CTA = `garage-red`; sorotan (Terlaris, ikon info, focus) = `garage-amber`. **Tidak ada emas `#d4af37`/`#f2ca50`.**
- Harga, qty, total, nomor order: `font-mono tabular-nums`.
- Judul kategori: Anton (`garage-display`) ~22px. Nama item: 16px bold, maks 2 baris (tidak terpotong).
- Radius kecil (`rounded-md`/`rounded-lg`). **Tidak ada pill** untuk tombol/bar utama.
- Status bukan warna saja: badge teks "Terlaris", "Stok terbatas", "Habis".

## 4. Foto produk

- Foto **opsional**: thumbnail 80–88px di kanan baris hanya bila `imageUrl` ada. **Tidak ada kotak placeholder kosong.**
- Upload lewat editor menu (`POST /api/menu/[id]/image`, WebP ≤800px). Layout otomatis menyesuaikan.
- `<img loading="lazy">` (URL bebas dari admin; bukan `next/image`).

## 5. Interaksi

- Item 1 varian: tombol `+` 44×44 → berubah jadi stepper `− n +`.
- Item multi-varian (Cold/Hot): tombol "Pilih" → sheet varian dengan harga per varian.
- Tab kategori = anchor + scroll-spy; saat mencari, tab diganti jumlah hasil.
- Touch target ≥ 44px; `prefers-reduced-motion` → scroll tanpa animasi.
- **Harga promo (`promoPrice`) tidak ditampilkan** — belum diterapkan di harga order QR server (hanya POS). Tampilkan hanya setelah server menerapkannya.

## 6. Kontrak yang tidak boleh berubah

- Props `MemberOrderPage`, parameter URL `table/tableLabel/source/outletId/campaign/q`.
- localStorage `garage:trackedOrder`, `garage:chatToken`; `/member-login?next=`.
- Payload `POST /api/customer/orders` di `checkout()`.

## 7. Checklist tambahan

- [ ] 390×844: judul + awal daftar menu terlihat tanpa scroll jauh.
- [ ] Bar keranjang tidak menutup baris menu terakhir.
- [ ] Tidak ada emoji sebagai ikon (tracker pakai lucide).
- [ ] Takeaway (`?source=qr_takeaway`): tanpa tombol Bantuan, judul "Pesan untuk dibawa pulang".
