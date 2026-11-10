# AYA V2 — Design handoff untuk Claude Code

## Source of truth
`assets/aya_master.svg` adalah acuan bentuk karakter; `assets/aya_*.svg` adalah ekspresi konsisten. `aya_v2_concept_sheet.svg` hanya concept board. Jangan gunakan gambar AI humanoid/anime sebelumnya sebagai identitas final Aya.

## Identitas visual
Maskot non-humanoid putih mungil berbentuk mochi/awan lembut, dua mata sipit, tangan/kaki pendek, titik antena digital, aksen merah Garage Coffee. Tidak ada telinga kucing, rambut manusia, kostum manusia, atau logo baru. Gunakan brand Garage Coffee tanpa elemen otomotif.

## Tokens
- Background: `#151514`
- Panel: `#242221`
- Text: `#FFF8EF`
- Muted: `#BDB4AA`
- Action red: `#C33C35`
- Alert red: `#E8493D`
- Warm accent: `#EBC29C`
- Cheek tint: `#F2A8A2`

## States (visual assets)
`idle`, `listening`, `speaking`, `thinking`, `warning`, `success`, `guiding`, `error`.

## UI behaviors
- Customer: floating guide (chat/voice/scroll ke menu, lokasi, IG) atas interaksi; pengunjung **tidak dapat checkout/order** dari menu digital. Waiter membuat pesanan.
- Staff: mini float + alert card departemen; suara hanya untuk departemen relevan; acknowledgment & cooldown.
- Owner: update deployment berdasarkan webhook/CI + verifikasi, ringkasan data, navigasi tindakan via MCP dengan RBAC.
- Audio voice + SFX terpisah; mute, captions, volume, reduced motion; tidak autoplay sebelum user berinteraksi.

## Animasi implementasi
- Idle: bobbing vertikal 3–5px 2.6s, blink acak terukur.
- Listening: body tilt +-3deg, ear-wave digital (bukan telinga) / ring pulse 1.2s.
- Thinking: micro tilt + glow dots, <=2s loop.
- Speaking: mouth visemes/timing dari TTS jika tersedia; fallback buka-tutup mulut bukan lip-sync akurat.
- Warning: gerak pendek sekali + highlight amber/red, tanpa flashing berulang.
- Success: bounce 1x 350ms; SFX halus.
- Guiding: menunjuk anchor DOM yang benar, scroll setelah perintah user.
- Error: ekspresi bingung + teks penjelasan dan aksi retry.

## Instruksi Claude Code
1. Baca file ini dan inspeksi repo Garage OS; jangan ubah arsitektur tanpa alasan.
2. Bangun komponen React `AyaMascot` dengan prop `state`, `size`, `muted`, `reducedMotion`, `role` dan prioritas accessibility.
3. Gunakan SVG di folder `assets/` sebagai visual source of truth. Bila ingin 3D, modelkan shape yang sama terlebih dahulu, bukan mengganti gaya karakter.
4. Gunakan CSS motion atau React Three Fiber secara lazy load. Untuk POS/KDS tablet, fallback SVG lebih diprioritaskan daripada WebGL berat.
5. Integrasikan voice, MCP, event, dan navigasi melalui adapter terpisah setelah cek izin server.
6. Uji snapshot delapan states, 3 breakpoint, keyboard focus, reduced-motion, kontrol audio dan no-overlap terhadap POS/KDS.
7. Jangan mengklaim gambar SVG ini sebagai model 3D rigged. Ini adalah asset vektor editable dan referensi pemodelan.
