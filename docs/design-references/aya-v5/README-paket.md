# AYA SVG Components V5 — Garage Coffee

Asset SVG vektor **direkonstruksi dari gambar referensi** komponen AYA yang dikirim. Bukan hasil ekspor dari file Figma asli; detail efek metalik dan robot dimodelkan ulang sebagai vektor SVG agar mudah diintegrasikan.

## Isi paket

- `svg/aya-idle.svg`, `aya-listening.svg`, `aya-thinking.svg`, `aya-speaking.svg`, `aya-happy.svg` — **5 state karakter**, transparan.
- `svg/aya-head-shell.svg`, `aya-body.svg`, `aya-face-*.svg` — **7 bagian terpisah** untuk animasi modular. Semua memakai coordinate space 480×480 yang sama; susun body → head shell → ekspresi. File layer tidak menyertakan efek tambahan seperti bubble di luar kepala.
- `svg/aya-floating-default.svg`, `aya-floating-attention.svg`, `aya-floating-active.svg` — **3 varian FAB**.
- `svg/aya-compact-help-card.svg` — kartu CTA Tanya AYA.
- `svg/aya-voice-controls.svg` — tiga state mic dan contoh waveform.
- `svg/aya-audio-toggle.svg` — tombol Audio On / Mute.
- `svg/aya-quick-prompts.svg` — panel ide pertanyaan cepat.
- `svg/aya-chat-panel.svg` — panel percakapan sebagai referensi desain (kopi berupa ilustrasi placeholder vektor).
- `svg/aya-component-board.svg` — board komponen dalam satu SVG.
- `icons/*.svg` — 12 ikon garis vektor.
- `preview/index.html` — pratinjau dan demonstrasi interaktif ringan.
- `manifest.json` — daftar semua aset.

## Untuk Claude Code

Salin folder `svg/` dan `icons/` ke `public/aya/` di repositori Garage OS. Gunakan file SVG karakter sebagai ikon atau ilustrasi sesuai state `idle | listening | thinking | speaking | happy`. Tampilkan `aya-floating-default.svg` sebagai FAB secara default, ganti ke `attention` jika ada notifikasi, dan `active` ketika mikrofon sedang merekam. Penggunaan mikrofon harus memerlukan gesture/izin pengguna. Jangan putar suara secara otomatis tanpa interaksi, dan hormati mode `mute` serta reduced-motion. Panel chat responsif perlu diimplementasikan sebagai elemen UI nyata (React + CSS), karena SVG panel di paket ini adalah **referensi visual statis**, bukan input interaktif.

> Penting: Menu digital pelanggan Garage Coffee hanya untuk melihat menu. AYA membantu navigasi, penjelasan, rekomendasi, lokasi, dan media sosial. Pesanan harus dicatat waiter, lalu disinkronkan dengan POS dan Bar/Kitchen. Akses publik dan staf/owner harus dipisahkan.

### Contoh pemakaian React/Next.js

```tsx
type AyaState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy';
export function AyaCharacter({ state = 'idle' }: { state?: AyaState }) {
  return <img src={`/aya/svg/aya-${state}.svg`} alt={`AYA ${state}`} width={240} height={240} />;
}
```

### Catatan estetika

Palet charcoal/hitam, metal silver, merah #F0443E. Logo `A` di headset dan dada digambar ulang berdasarkan referensi visual: untuk kebutuhan identitas resmi yang benar-benar identik, ganti path `A` dengan vector logo resmi milik Garage Coffee.
