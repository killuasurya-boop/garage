# Alur kerja desain: ChatGPT (render) + Claude Code (kode)

Status: usulan, 4 Nov 2026. Tidak mengubah kode aplikasi.

## 1. Keputusan: integrasi MCP ChatGPT tidak dipakai untuk desain

Integrasi `/api/mcp/chatgpt` (flag `GARAGE_MCP_CHATGPT_ENABLED`) menghubungkan ChatGPT ke **data dan tool operasional
Garage** (laporan, kas, gudang, audit; Owner + 2FA, tulis data lewat preview dan token). Ia tidak membuat gambar.

Untuk kebutuhan desain, data Garage sudah ada di ChatGPT (Project/knowledge), jadi koneksi ke aplikasi produksi
tidak menambah apa pun dan hanya menambah risiko. Karena itu flag tetap **mati**. Kalau suatu saat Owner ingin
mengaktifkannya untuk laporan, itu keputusan terpisah: butuh env di VPS, `BETTER_AUTH_URL` HTTPS, backup terverifikasi
dan persetujuan Owner (lihat CLAUDE.md, bagian MCP ChatGPT dan Event Menu Rules).

## 2. Pembagian peran

| Pekerjaan | ChatGPT | Claude Code |
|---|---|---|
| Foto produk, ilustrasi, banner, tekstur, mockup visual | Ya | Tidak |
| Eksplorasi arah visual dan variasi | Ya | Bantu memilih |
| Komponen, layout, state, responsif, aksesibilitas | Tidak | Ya (shadcn, playwright, skill UI) |
| Harga, nama menu, stok, status, teks UI | **Jangan dari gambar** | Selalu dari data/kode |
| Audit kontras, overflow, 390x844 dan 1366x900 | Tidak | Ya |

Aturan emas: gambar dari ChatGPT adalah **aset atau referensi**, bukan sumber kebenaran. Teks di dalam gambar
(harga, nama, tanggal) sering salah eja; semua teks dipasang oleh kode.

## 3. Blok konteks (tempel sekali ke Instructions Project ChatGPT)

```
Kamu art director untuk "Garage Coffee" (kafe kopi dan makanan, bukan bengkel). Aplikasi dipakai kasir, dapur, bar
dan pelanggan lewat menu digital di HP.

Palet WAJIB (dari src/app/globals.css):
- Latar aspal hitam netral: #0a0a0c, #121216, #19191e, panel #232329, garis #34343c
- Teks #f4f4f5, teks redup #d0d0d6, chrome/silver #d4d4d8
- Aksen utama merah #d11a2a (hover #ff2a3a), sorotan amber #f5a742
- Hijau #22c55e hanya untuk status "tersedia/sukses", bukan aksen merek
Gaya: industrial gelap, chrome, merah tegas, padat tapi terbaca. Radius kecil. Tanpa blob dekoratif, tanpa
gradien ungu/biru, tanpa gaya "SaaS generik", tanpa hero marketing besar.

Larangan:
- Jangan membuat ulang, menggambar ulang atau mengubah logo Garage Coffee. Logo hanya ditempel dari file resmi.
- Jangan tulis harga, nama menu, atau angka di dalam gambar.
- Jangan gambar rokok/vape pada materi menu digital. Jangan tampilkan merek sponsor.
- Jangan pakai citra mobil/motor pada materi member.
- Jangan mengarang fitur, promo, alamat atau nomor telepon.

Keluaran: sebutkan ukuran, rasio, dan apakah latar transparan. Beri 3 variasi dan jelaskan perbedaannya
dalam satu kalimat tiap variasi.
```

Upload ke Project: `public/garage-brand/garage-coffee-logo.png`, `garage-coffee-logo-dark.png`, `garage-coffee-icon.png`,
foto menu yang sudah ada, dan tangkapan layar menu digital saat ini (`/order`, 390x844).

## 4. Template prompt

Ganti isi `[...]`. Selalu mulai percakapan baru di Project yang sama supaya blok konteks ikut terbaca.

**A. Foto produk untuk kartu menu**
```
Foto produk [nama menu, mis. Kopi Susu Es] di gelas [jenis gelas], tampak depan sedikit dari atas (45 derajat).
Latar gelap aspal #121216 dengan cahaya samping hangat, pantulan chrome halus. Satu produk di tengah, ruang kosong
di sekitar agar bisa dipotong ke 1:1 dan 4:3. Realistis, tanpa teks, tanpa logo, tanpa tangan.
Ukuran 1600x1600, latar tidak transparan.
```

**B. Banner promo atau acara (tanpa teks)**
```
Latar banner [tema acara] untuk menu digital HP, rasio 16:9 dan versi 9:16. Palet Garage, komposisi dengan area
kosong di sepertiga kiri untuk teks yang saya pasang sendiri. Tanpa teks, tanpa logo, tanpa harga.
```

**C. Mockup layar menu digital (referensi, bukan produksi)**
```
Mockup layar HP 390x844, menu digital kafe: daftar kategori di atas (tab), kartu menu dengan foto, nama, harga,
tombol tambah, dan keranjang melayang di bawah. Gunakan palet Garage. Teks isi bebas karena hanya referensi tata
letak. Beri 3 arah: (1) kartu rapat, (2) kartu besar, (3) daftar dengan foto kecil.
```

**D. Ikon atau ilustrasi kecil**
```
Set 6 ikon garis [daftar ikon] gaya konsisten, tebal 2px, ujung bulat, warna #d4d4d8, latar transparan, SVG-friendly,
kotak 24x24. Tanpa gradien.
```

**E. Empty state / status**
```
Ilustrasi kecil 600x400 untuk keadaan [mis. "menu habis"], gaya garis chrome di atas aspal gelap, aksen merah
#d11a2a satu titik saja. Tanpa teks.
```

## 5. Plan kerja (urutan disarankan)

1. **Audit dulu (Claude Code).** Jalankan `web-design-guidelines` pada `src/app/order/**` dan ambil tangkapan layar
   390x844 lewat `playwright`. Hasilnya daftar masalah nyata, supaya render ChatGPT menjawab kebutuhan, bukan selera.
2. **Brief arah (kamu + ChatGPT).** Pilih satu dari tiga arah kartu menu (prompt C). Putuskan; jangan lanjut dengan banyak arah.
3. **Aset (ChatGPT).** Foto produk (A) untuk menu terlaris dulu, 5-10 item. Lalu banner (B) dan ikon (D) bila perlu.
4. **Serah-terima aset.** Lihat bagian 6. Kirim file ke Claude Code, jangan tempel di chat dalam bentuk deskripsi.
5. **Implementasi (Claude Code).** Cari komponen dengan `shadcn`, cek API dengan `context7`, bangun, lalu
   verifikasi dengan `playwright` di 1366x900 dan 390x844. Pakai token `--garage-*` dan `--gos-*`, bukan hex baru.
6. **QA dan rilis.** Checklist bagian 7, lalu `npm run lint` dan `npm run build`. Rilis lewat alur staging
   (`docs/STAGING.md`) sebelum produksi.

Kerjakan per layar (menu publik, keranjang, status pesanan), bukan semuanya sekaligus.

## 6. Serah-terima aset

- Foto produk: WebP, sisi panjang 1600 px, di bawah 250 KB per file. Banner: WebP, 1600 px lebar. Ikon: SVG.
- Nama file kebab-case dan stabil, mis. `kopi-susu-es.webp`. Letakkan di `public/` (Claude Code yang memasang).
- Satu foto per produk/varian; gambar menu harus mewakili produk yang benar-benar dijual.
- Simpan prompt dan tanggal pembuatan di catatan (satu baris per aset) untuk pelacakan.
- Logo selalu dari file resmi, `object-contain`, tidak dipotong.
- Periksa syarat penggunaan komersial layanan pembuat gambar di akunmu sebelum dipakai publik. Saya tidak bisa memverifikasinya dari sini.

## 7. Checklist QA gambar dan layar

- [ ] Warna cocok palet (merah `#d11a2a`, amber `#f5a742`), tidak ada biru/ungu/hijau merek baru
- [ ] Tidak ada teks, harga, atau logo palsu di dalam gambar
- [ ] Harga, nama, status tampil dari data dan terbaca (kontras AA) di 390x844
- [ ] Tidak ada overflow horizontal, tidak ada teks terpotong
- [ ] Warna status meja tetap sesuai `src/lib/garage-table-status.ts` dan selalu ada label teks
- [ ] Gerak mengikuti `prefers-reduced-motion`
- [ ] Tidak ada rokok/vape di menu digital; tidak ada logo sponsor di luar `/grand-opening`
