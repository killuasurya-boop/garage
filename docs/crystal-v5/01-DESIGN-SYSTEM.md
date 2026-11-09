# Garage Crystal V5 — 01 Design system

Black Crystal Glass × Red Laser × Cinematic Coffee. Acuan: `docs/design-references/crystal-v5/01–05.webp`.

## Token (`--gc-*`, sumber `src/lib/crystal-tokens.ts`, CSS `src/components/crystal/crystal.css`)
| Token | Hex | Pakai |
|---|---|---|
| `--gc-bg` | #08090B | Kanvas |
| `--gc-bg-2` | #111216 | Header, panel |
| `--gc-surface` | #1B1D21 | Kartu crystal |
| `--gc-surface-2` | #24272D | Kartu terangkat, input |
| `--gc-text` | #FFFFFF | Judul, harga |
| `--gc-cream` | #F3E8DA | Eyebrow, headline hangat |
| `--gc-text-2` | #B8B8BE | Deskripsi |
| `--gc-red` | #E1252B | Latar tombol utama (teks putih) |
| `--gc-laser` | #FF2638 | Garis laser, glow, border aktif |
| `--gc-laser-bright` | #FF5362 | Teks merah di latar gelap |
| `--gc-emerald` | #23C96B | Tersedia |
| `--gc-blue` / `--gc-blue-text` | #3984FF / #7FB0FF | Reservasi (titik / teks) |
| `--gc-amber` | #FFBD42 | Perhatian, focus ring |

Kontras AA diuji (`crystal-tokens.test.ts`). Status selalu titik + label teks.

## Geometri
Radius 22 / 16 / 12 / pill. Border 1px `rgb(255 255 255 / .10)` (kuat .18, laser `rgb(255 38 56 / .55)`).
Bayangan `0 18px 40px rgb(0 0 0/.55)` + kilau atas 1px. Tombol min 48px (ikon 44px), chip 38px.

## Tipografi
Display: Montserrat 800 italic uppercase (`.gc-display`). Body: Inter. Eyebrow 11px tracking .28em cream.

## Glass (8 varian, `CrystalCard variant=`)
default · elevated · active/selected (border + glow laser) · hover (naik 2px, hanya pointer) · disabled (55% + abu) ·
error (border merah) · loading (sweep). Tidak memakai blur berat (backdrop-filter dilarang di permukaan kasir/HP).

## Komponen (`src/components/crystal/crystal.tsx`)
`CrystalCard`, `CrystalButton` (primary/secondary/ghost/google/icon, loading), `CrystalChip`, `CrystalBadge`
(red/gold/neutral), `StatusDot`, `CrystalSkeleton`, `CrystalSheet` (bottom sheet, Escape), `LaserBorder`, `CrystalIcon`.
Registri hidup: `/control/design-system` (bagian Crystal V5).

## Gerak (`CRYSTAL_MOTION`)
press 90 ms (scale .97) · hover 160 ms · reveal 420 ms · sheet 320 ms · ganti lantai 280 ms · laser loop 5,2 s
(berhenti saat tidak terlihat). Easing `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion`: semua transform/loop mati,
diganti fade 120 ms; laser jadi garis statis.

## Gambar
Hanya foto produk asli (`public/menu-photos`, `garage-uploads/menu`). Hero order = foto es kopi gelas plastik yang
sudah ada; tidak ada foto kopi panas di hero. Logo & AYA hanya aset resmi (`object-contain`).
