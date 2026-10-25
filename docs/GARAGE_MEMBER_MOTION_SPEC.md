# Garage Coffee — Member UI Motion Spec (dikunci Okt 2026)

Gerak di UI member harus **sinematik, ringan, dan membantu kejelasan**. Login harus tetap berfungsi penuh tanpa animasi.

## Teknologi

- Hanya CSS (keyframes + transition) di `src/components/garage/member-auth/member-auth.css`.
- Tidak memakai GSAP, karena belum terpasang dan tidak perlu.
- `framer-motion` tidak dipakai untuk halaman ini, demi JS yang minimal.
- Semua animasi dibungkus `@media (prefers-reduced-motion: no-preference)`.
- Bila reduced motion aktif, elemen langsung tampil (opacity 1, tanpa transform).

## Bahasa gerak

| Nama | Kelas | Durasi / easing | Pemakaian |
|---|---|---|---|
| Reveal | `.gm-reveal` + `--gm-delay` | 640ms `cubic-bezier(.2,.7,.2,1)`, `translateY(14px)` → 0, opacity 0 → 1 | Logo, headline, kartu, adegan (bertahap 0 / 80 / 160 / 240ms) |
| Glow laser | `.gm-laser` | 5.5s ease-in-out, berulang, opacity .55 ↔ .9 | Dua garis neon merah vertikal di latar. Hanya opacity, tanpa layout. |
| Uap kopi | `.gm-steam` | 7s ease-in-out, berulang, opacity + translateY 8px | Di atas cangkir pada desktop/tablet. Dimatikan di mobile. |
| Hover tombol | transition 160ms | background, box-shadow; panah `translateX(3px)` | Tombol primary dan secondary |
| Tekan | `:active` | `translateY(1px)` | Semua tombol |
| Fokus | transition 160ms | border + ring | Input |
| Ganti langkah | `.gm-step` | 360ms fade + slide 10px | Email → PIN, Masuk ↔ Daftar |
| Sukses | `.gm-success` | 300ms | Centang + "Berhasil masuk" sebelum redirect |

## Larangan

- Parallax, blur berat (> 12px di area besar), atau animasi yang menggeser layout.
- Partikel/ember tanpa henti di UI member.
- Animasi properti `width`, `height`, `top`, atau `left`.
- Durasi mikro-interaksi > 300ms.
- Menunda input pengguna karena animasi; form bisa diketik sejak render pertama.
