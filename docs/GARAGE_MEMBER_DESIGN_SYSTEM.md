# Garage Coffee — Member UI Design System (dikunci Okt 2026)

Sumber kebenaran untuk semua UI **member** (customer): `/member-login`, `/member`, dan layar member berikutnya.
UI operasional staf (POS, OS, gudang) tetap mengikuti `design-system/MASTER.md`.

**Referensi desain yang disetujui:** `docs/design-references/member-login/`

| File | Viewport | Komposisi |
|---|---|---|
| `desktop.webp` | 1440×900 | Split: cerita brand di kiri, kartu login di kanan. |
| `tablet.webp` | 768×1024 | Potret: logo, headline, lalu kartu login di tengah. |
| `mobile.webp` | 390×844 | Mobile-first: logo, sapaan, form penuh lebar, adegan cangkir di bawah. |

Implementasi:
- `src/components/garage/member-auth/` — komponen;
- `src/components/garage/member-auth/member-auth.css` — token dan kelas `gm-*`;
- `src/app/member-login/page.tsx`.

## 1. Aturan brand

- Brand = **Garage Coffee** (tanpa "& Motor").
- Logo resmi: `public/garage-brand/garage-coffee-logo.png` (metalik silver + segitiga merah, transparan).
  - Selalu `object-contain`.
  - Wordmark tidak boleh dipotong, direkonstruksi dengan font, diwarnai ulang, atau diberi efek baru.
- Gambar adegan: `public/garage-brand/member/member-scene.webp`.
  - Isinya cangkir hitam berlogo, biji kopi, meja beton, dan lampu merah.
  - Dipotong dari referensi desktop yang disetujui.
- **Dilarang:** gambar otomotif atau motor (aset lama "Coffee & Motor" tidak dipakai di UI member), blob dekoratif, dan gaya SaaS hijau/biru.

## 2. Warna (token semantik)

| Token CSS | Nilai | Pemakaian |
|---|---|---|
| `--gm-bg` | `#080809` | Latar halaman |
| `--gm-bg-2` | `#141416` | Latar sekunder, gradien |
| `--gm-card` | `#1D1D20` | Permukaan kartu dan input |
| `--gm-text` | `#F4F1EC` | Teks utama |
| `--gm-text-2` | `#A7A4A1` | Teks sekunder dan placeholder kuat |
| `--gm-accent` | `#B92F35` | Merah utama: tombol, aksen, garis |
| `--gm-accent-hover` | `#D44549` | Hover/fokus merah, tautan |
| `--gm-metal` | `#A5A5A8` | Detail metalik, eyebrow, ikon |
| `--gm-border` | `rgb(165 165 168 / 0.22)` | Border kartu dan input |
| `--gm-border-strong` | `rgb(165 165 168 / 0.38)` | Border input saat hover |
| `--gm-danger-bg` | `rgb(185 47 53 / 0.14)` | Latar pesan error |

**Kontras:**
- Teks sekunder di atas `--gm-card` lolos AA (≥ 4.5:1).
- Placeholder tidak boleh lebih gelap dari `#8C8986`.

## 3. Tipografi

- **Heading:** Space Grotesk (`--font-space-grotesk`, dimuat global), weight 600–700, tracking `-0.02em`.
- **Body / form:** Inter (`--font-inter`, dimuat di halaman member).
- **Headline editorial** ("YOUR COFFEE. / YOUR EXPERIENCE."): Space Grotesk 700, uppercase, tracking `-0.03em`, line-height 0.95. Baris kedua berwarna `--gm-accent`.
- **Eyebrow** (MEMBER ACCESS, breadcrumb, tagline): Inter 500, 11px, uppercase, tracking `0.32em`, warna `--gm-metal`.

| Skala | Mobile | Tablet | Desktop |
|---|---|---|---|
| Headline editorial | — (disembunyikan) | 48px | clamp(48px, 4.6vw, 72px) |
| Judul kartu ("Selamat Datang Kembali.") | 36px | 40px | 40px |
| Body | 15px / 1.6 | 15px / 1.6 | 15px / 1.6 |
| Label input | 14px | 14px | 14px |
| Tombol | 15px, weight 600 | 15px, weight 600 | 15px, weight 600 |

## 4. Spasi dan geometri

- **Skala spasi:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
- **Radius:**
  - kartu `--gm-radius-card: 18px`;
  - input dan tombol `--gm-radius-control: 8px`.
- **Tinggi kontrol:** input `--gm-h-input: 56px`; tombol `--gm-h-button: 56px`. Target sentuh minimal 44px.
- **Lebar kartu:** desktop 520–560px, tablet maks 580px, mobile penuh dengan gutter 24px.
- **Bayangan kartu:** `0 30px 80px rgb(0 0 0 / .55)`, ditambah cahaya merah tipis di tepi (`0 0 0 1px` dan `0 0 40px rgb(185 47 53 / .18)`).
- **Breakpoint:**
  - `< 768px` = mobile;
  - `768–1023px` = tablet (komposisi tengah);
  - `≥ 1024px` = desktop split. Tablet landscape 1024 sudah memakai split.

## 5. Komponen (wajib dipakai ulang)

| Komponen | File | Catatan |
|---|---|---|
| `MemberLoginPage` | `member-login-page.tsx` | Kerangka responsif, mengatur langkah auth. |
| `CinematicBackground` | `cinematic-background.tsx` | Latar asphalt, adegan cangkir, `RedLaserEffect`, grain, dan vignette. |
| `GarageBrandLogo` | `garage-brand-logo.tsx` | Logo resmi, `priority`, `object-contain`. |
| `BrandExperiencePanel` | `brand-experience-panel.tsx` | Breadcrumb, logo, headline, dan tagline. Di desktop tampil di kiri; di tablet tampil di atas kartu. |
| `MemberLoginCard` | `member-login-card.tsx` | Permukaan kartu, eyebrow, judul, footer legal. |
| `MemberField` | `member-field.tsx` | Label, ikon, input, dan pesan bantuan. |
| `MemberButton` | `member-button.tsx` | `primary` (merah gradien) dan `secondary` (gelap ber-border), dengan state loading. |
| `AuthenticationStatus` | `authentication-status.tsx` | Pesan error, info, dan sukses (`role="alert"` / `status`). |
| `MotionReveal` | `motion-reveal.tsx` | Fade dan slide masuk. Lihat `GARAGE_MEMBER_MOTION_SPEC.md`. |

**State input:**
- **Default:** border `--gm-border`.
- **Hover:** `--gm-border-strong`.
- **Fokus:** border `--gm-accent-hover` dengan ring 3px `rgb(212 69 73 / .25)`.
- **Error:** border `--gm-accent` dan pesan di bawahnya.
- **Disabled:** opacity 0.6.

**Tombol primary:**
- **Default:** gradien `#C8363C → #9E262B`, teks `--gm-text`, panah di kanan.
- **Hover:** lebih terang, menuju `--gm-accent-hover`.
- **Ditekan:** `translateY(1px)`.
- **Loading:** spinner dengan teks "Memproses…", tombol disabled.

## 6. Komposisi per viewport

| Elemen | Desktop | Tablet | Mobile |
|---|---|---|---|
| Breadcrumb "GARAGE COFFEE / MEMBER EXPERIENCE" | Kiri atas | Disembunyikan | Disembunyikan |
| Tagline "GOOD COFFEE BUILDS BETTER DAYS." | Kanan atas, garis merah | Disembunyikan | Disembunyikan |
| Logo | Kiri, lebar ±640px | Tengah, ±600px | Tengah, ±300px |
| Headline + sub | Kiri | Tengah | Disembunyikan; kartu langsung menyapa |
| Kartu login | Kanan, ±550px | Tengah, ±580px | Tanpa bingkai kartu, penuh lebar |
| Adegan cangkir | Bawah kiri | Bawah | Bawah form |
| Footer strip "COFFEE · PEOPLE · STORIES…" | Kiri bawah | Disembunyikan | Disembunyikan |

## 7. Penyimpangan yang disetujui dari mockup (fungsional)

Mockup memakai email + OTP + Google. Garage OS sekarang memakai **login member nomor HP/email + PIN** (`/api/member/auth/*`, JWT cookie sendiri, bukan Supabase).

Penyesuaiannya:
- Field "Email" menerima **email atau nomor HP**. Label tombol mengikuti isi field: "Lanjutkan dengan Email" atau "Lanjutkan dengan Nomor HP".
- Setelah "Lanjutkan", form meminta **PIN** di kartu yang sama (langkah 2).
- Tombol **Google** dan pembatas "ATAU" tidak ditampilkan karena belum ada OAuth Google yang dikonfigurasi. Tombol palsu tidak boleh dibuat.
- "Daftar Sekarang" membuka mode daftar di kartu yang sama: nama, nomor HP, PIN, dan data opsional.

## 8. Kartu member (`PremiumMembershipCard`)

Satu sumber data: `src/lib/membership-card-model.ts`, dipakai layar, PNG/JPG, dan PDF.

### Depan
- Logo + "GARAGE".
- `COFFEE · TEBING TINGGI`.
- Tier dengan ikon lucide: Silver Shield, Gold Crown, Platinum Gem, Ultra Sparkles.
- Foto member, atau inisial bila tidak ada foto.
- Nama dan **kode member asli**. Kode boleh pindah baris di tanda hubung dan tidak pernah terpotong.
- QR besar di plate putih.
- "Member sejak" dan "Berlaku s/d".

### Belakang (info asli)
- Benefit tier (multiplier dari aturan poin), maksimal 3 baris.
- QR.
- Poin, Berlaku, dan Kontak. Alamat hanya tampil bila ruang cukup.
- Footer `garagecoffee.id` · kode.

### Status dan aksi
- **Expired:** pita merah "EXPIRED" + kartu sedikit pudar.
- **Tombol "Tunjukkan QR ke kasir":** membuka dialog QR besar (±300 px, plate putih). Untuk member saja; admin memakai `showQrButton={false}`.

### Keterbacaan
- Teks diskalakan dengan container query (`cqw`).
- Label minimal 9 px. Warna muted per tier dijaga kontrasnya.

### Kontrol
- Sisi kartu bisa dikendalikan induk: `side` + `onSideChange`.
- Tombol "Lihat depan/belakang" di halaman selalu sinkron dengan ketukan pada kartu.
