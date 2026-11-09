# Brief 001: Objek modul Garage OS untuk section #surya-dev

- Status: SHIPPED (PR #184)
- Layar/kebutuhan: section `#surya-dev` di homepage (`src/components/surya/`), panggung Garage OS desktop 1440x900
  dan alur mobile 390x844. Menggantikan ilustrasi SVG di `surya-illustrations.tsx`.
- Tujuan pengguna: calon klien SURYA.dev melihat Garage OS sebagai ekosistem nyata (waiter, POS, bar, kitchen,
  owner dashboard) yang terhubung jalur data merah, seperti referensi A/B yang disetujui Owner.

## Kebutuhan aset
| Aset | Ukuran | Format | Transparan? | Jumlah |
|---|---|---|---|---|
| `waiter` barista memegang tablet di atas dudukan logam | 1024x1024 | PNG | Ya | 1 |
| `pos` POS touchscreen di atas dudukan logam | 1024x1024 | PNG | Ya | 1 |
| `bar` mesin espresso + cangkir di atas dudukan logam | 1024x1024 | PNG | Ya | 1 |
| `kitchen` kompor/wajan berasap di atas dudukan logam | 1024x1024 | PNG | Ya | 1 |
| `owner` monitor dashboard (grafik batang merah) di atas dudukan logam | 1024x1024 | PNG | Ya | 1 |
| `core` platform GARAGE OS (logam gelap, trim merah menyala), TANPA tulisan | 1536x1024 | PNG | Ya | 1 |

Simpan ke `docs/design-handoff/assets-incoming/001-surya-dev-modules/` dengan nama `waiter.png`, `pos.png`, dst.

## Prompt untuk ChatGPT

Tempel blok GAYA sekali, lalu satu prompt per objek (satu gambar per pesan, minta latar transparan).

**GAYA (tempel dulu):**
```
Saya butuh satu set objek 3D render untuk website. Gaya harus konsisten di semua gambar:
- Render 3D sinematik realistis, tampak dari depan agak atas (sudut kamera sekitar 25°), proporsi seperti diorama.
- Setiap objek berdiri di atas dudukan logam persegi gelap (#1A1A1E) dengan tepi chrome tipis dan garis lampu merah
  menyala (#FF3045) di sekeliling dasar dudukan.
- Material: logam gelap brushed, chrome, kaca. Cahaya utama hangat amber (#D69A55) dari kiri atas, rim light merah dari belakang.
- Latar TRANSPARAN (PNG alpha). Tanpa lantai, tanpa dinding, tanpa bayangan lebar keluar dudukan.
- DILARANG: teks, huruf, angka, logo, merek, harga, watermark, UI bertuliskan kata. Layar perangkat hanya berisi
  bentuk abstrak (kotak, grafik batang, lingkaran) warna merah/abu, tanpa tulisan.
- Bukan kartun, bukan ilustrasi datar, bukan neon biru/ungu.
- Ukuran 1024x1024, objek di tengah, sisakan margin 8% di semua sisi.
```

**waiter.png**
```
Objek: seorang barista pria berapron hitam, berdiri setengah badan di atas dudukan, memegang tablet hitam dengan
kedua tangan dan melihat layarnya. Layar tablet menampilkan kotak-kotak menu abstrak merah dan abu tanpa teks.
Pakaian kemeja gelap. Wajah netral profesional. Ikuti blok GAYA.
```

**pos.png**
```
Objek: terminal POS kasir layar sentuh modern (layar miring ~15°) di atas dudukan, dengan laci kas kecil di bawahnya.
Layar menampilkan grid tombol abstrak (beberapa merah menyala) tanpa teks. Ikuti blok GAYA.
```

**bar.png**
```
Objek: mesin espresso komersial dua grup berbahan chrome dan hitam di atas dudukan, deretan cangkir putih di atas
mesin, satu cangkir di bawah portafilter dengan uap tipis. Tanpa merek atau tulisan. Ikuti blok GAYA.
```

**kitchen.png**
```
Objek: stasiun dapur ringkas: kompor stainless dengan wajan berasap dan satu panci kecil di atas dudukan. Uap tipis
naik. Tanpa api besar, tanpa tulisan. Ikuti blok GAYA.
```

**owner.png**
```
Objek: monitor/laptop lebar di atas dudukan, layar menampilkan dashboard abstrak: grafik batang merah naik, satu
grafik donat merah, beberapa garis abu. Tanpa teks atau angka di layar. Ikuti blok GAYA.
```

**core.png** (1536x1024)
```
Objek: platform inti futuristik oktagonal pipih melayang, logam gelap dengan tepi chrome, garis trim merah menyala di
sisi, cincin cahaya merah tipis mengelilingi di lantai bayangan. Permukaan atas kosong (teks GARAGE OS akan ditambah
oleh website, jangan digambar). Ikuti blok GAYA, ukuran 1536x1024.
```

## Checklist penerimaan
- [ ] Palet sesuai: hitam asphalt, chrome, merah #D11A2A/#FF3045, amber hangat; tanpa biru/ungu
- [ ] Tanpa teks/huruf/angka/logo/merek di dalam gambar (termasuk layar perangkat)
- [ ] PNG transparan asli (alpha), bukan latar putih/kotak-kotak
- [ ] Sudut kamera dan dudukan konsisten di keenam gambar
- [ ] Ukuran sesuai tabel, objek tidak terpotong
- [ ] Tidak ada otomotif/motor

## Catatan review (diisi Claude Code)
- 2026-11-09: 6 render diterima dari ChatGPT. bar/kitchen/owner/core lolos (PNG alpha, tanpa teks).
  waiter & pos memuat logo GARAGE COFFEE yang digambar ulang AI (apron, layar, laci kas, printer) + strip merah di lengan:
  dihapus dengan inpainting OpenCV sebelum dipasang. Semua dipasang sebagai WebP 560px di `public/surya-dev/`
  (core 1100px). Original PNG tidak di-commit (6,4 MB).
