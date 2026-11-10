# AYA V2 — Keputusan Owner (mengalahkan isi spec bila bertentangan)

## OD-01 — Customer TETAP bisa memesan di menu digital; Aya memandu (4 Nov 2026)

**Kata Owner:** "Di menu digital Aya mengarahkan, maksudnya customer untuk pesan dan cara pesan dengan animasi menunjukkan tangan ke button."

Keputusan ini **membatalkan** semua aturan "customer tidak bisa order/checkout dari menu digital" di
[AYA_V2_MASTER_SPEC_CLAUDE_CODE.md](AYA_V2_MASTER_SPEC_CLAUDE_CODE.md) (§0.1, §2 tabel peran, §5.2, Phase 2 gate, AC-PUB-03, §22, §23, §24).

Yang berlaku:
- Alur pesan pelanggan yang **sudah ada di produksi tetap dipakai**: `/order` (`src/components/garage/member-order-page.tsx`) — pilih menu → keranjang → checkout QR meja / event → bukti bayar (`/api/customer/orders`, `/api/customer/orders/payment-proof`). Status menerima order mengikuti shift kasir (`/api/customer/ordering-status`). **Tidak perlu** sakelar "lihat saja".
- Aya di menu digital **memandu customer memesan**: menjelaskan cara pesan langkah demi langkah dan memakai state **`guiding`** (`design-kit/assets/aya_guiding.svg`) untuk **menunjuk dengan tangan ke tombol yang tepat** — mis. tombol tambah item, keranjang, checkout, upload bukti bayar — dengan sorotan (highlight) pada tombol itu.
- Aya **tidak menekan tombol atas nama customer** dan tidak mengisi data pembayaran; customer tetap yang menekan. Aya hanya menunjuk, menyorot, menggulir (atas perintah/izin), dan menjelaskan.
- Bila outlet tidak menerima order (shift kasir tutup / meja QR tidak valid), Aya menjelaskan alasannya dan tidak menunjuk ke checkout.
- Waiter tetap bisa membuat pesanan dari Garage OS seperti sekarang (dua jalur berdampingan).

Kriteria terima pengganti AC-PUB-03:
- "Cara pesan" menampilkan langkah sesuai alur `/order` aktual, dan Aya (state `guiding`) menunjuk + menyorot tombol yang sedang dibahas; anchor tidak meleset di mobile/tablet/desktop.
- Penunjuk dan sorotan hilang saat customer menutup Aya atau menekan tombol; tidak menghalangi tombol (tidak ada overlay yang menangkap klik).
- Tidak ada aksi pesan/bayar yang dijalankan Aya sendiri; `prefers-reduced-motion` → sorotan statis tanpa animasi gerak.

## OD-02 — Karakter Aya V2 dipakai di SEMUA layar (4 Nov 2026)

**Kata Owner:** "Ya, pakai V2."

- Bentuk resmi Aya = `design-kit/assets/aya_master.svg` + 8 state (`idle, listening, speaking, thinking, warning, success, guiding, error`). Karakter V1 (D-07, `public/garage-brand/aya/aya-{avatar,full}.svg`, `AyaCharacter` lama) **diganti**, bukan dipasang berdampingan.
- Titik pemasangan V1 di main 4f74bf5 yang wajib ikut berganti:
  - `src/components/garage/garage-app-loader.tsx` → `AyaStaffCompanion` (semua layar Garage OS staf/Owner, termasuk POS & Production Hub).
  - `src/components/garage/member-order-page.tsx` → `AyaFloatingPet scope="order"` + `order/aya-greeting.tsx` (menu digital customer).
  - `src/components/garage/aya-avatar.tsx` (`AyaAvatar`, crop kepala) dan `src/lib/garage-ai-persona.ts` → `AYA_AVATAR_SRC` (avatar statis non-React).
  - `src/components/garage/aya/aya-character.tsx`, `aya-floating-pet.tsx`, `aya.css` → digantikan `AyaMascot` V2 (boleh mempertahankan API props lama sebagai adapter agar pemanggil tidak pecah).
- Aset V2 disalin ke `public/garage-brand/aya/v2/`; file V1 boleh dihapus setelah tidak ada referensi (cek `git grep`).
- Kriteria terima: tidak ada lagi referensi visual V1; snapshot 8 state di 3 breakpoint; ukuran SVG tetap ringan untuk tablet kasir/KDS; animasi menghormati `prefers-reduced-motion`; tidak menutupi tombol POS/KDS/checkout; tes Aya yang ada (`aya-floating-pet.test.ts`, `aya-persona.test.ts`, `order/aya-greeting.test.ts`) diperbarui dan lulus.
- Persona teks di `garage-ai-persona.ts` ("makhluk digital mungil putih bermata sipit…") tetap; deskripsi visual boleh dirapikan agar cocok V2 (mochi/awan, antena digital, aksen merah Garage Coffee), tanpa mengubah aturan perilaku.

## OD-03 — Mode Rp 0: tanpa biaya OpenAI API untuk Aya V2 (4 Nov 2026)

**Kata Owner:** "Mode Rp 0." (Owner berlangganan ChatGPT Plus/Go bulanan; langganan itu **tidak** mencakup OpenAI API.)

- **Owner → kontrol Garage OS lewat ChatGPT + MCP Garage OS** (sudah ada di produksi: `mcp-chatgpt-gateway.ts`, OAuth + 2FA + kill switch + audit + konfirmasi R2/R3). Ini memakai langganan ChatGPT Owner, tanpa biaya API. Jangan membangun ulang kontrol Owner di jalur berbayar.
  Catatan: ketersediaan connector/MCP kustom tergantung paket ChatGPT; Owner perlu memastikan di ChatGPT → Settings → Apps/Connectors (terutama paket Go).
- **Aya di dalam aplikasi bekerja TANPA LLM berbayar**: pengingat per divisi (data `/api/ops-center`), panduan cara pesan + tangan menunjuk tombol (OD-01), What's New / release notes, notifikasi deployment, Smart Action Center, FAQ publik dari data menu/setting — semuanya **berbasis data sistem + aturan + template**, bukan model AI.
- **Suara:** Web Speech API browser (gratis, sudah ada di `src/lib/garage-voice.ts`). ElevenLabs tetap **mati**. STT (mendengar) hanya Web Speech API browser dengan izin mikrofon; tanpa layanan STT server.
- **Chat bebas Aya dengan OpenAI API (branch B):** jalur boleh dibangun (tool gateway, filter peran, konfirmasi), tetapi **budget guard default = Rp 0 → fitur mati**. Aya menjawab dengan fallback berbasis aturan/FAQ dan mengarahkan Owner ke ChatGPT. Aktif hanya bila Owner sendiri mengisi batas harian di pengaturan.
- **Fitur AI lama yang sudah ada di produksi** (`/api/ai/pos-agent`, owner chat, shift copilot, system doctor, CEO broadcast) **tidak diubah diam-diam** oleh pekerjaan Aya V2. Agent cukup mencatat apakah fitur itu memanggil API berbayar dan melaporkannya ke Owner untuk diputuskan terpisah.
- Kriteria terima: tidak ada panggilan ke `api.openai.com`, ElevenLabs, atau layanan berbayar lain dari fitur Aya V2 saat budget = 0 (dibuktikan dengan tes yang memblokir/mock fetch); semua fitur V2 untuk staf & customer tetap berfungsi tanpa `OPENAI_API_KEY`.

## OD-04 — Suara, SFX, dan urutan animasi (4 Nov 2026)

Owner memilih rekomendasi di [PLAN-ANIMASI-SUARA-SCROLL.md](PLAN-ANIMASI-SUARA-SCROLL.md):
- **SFX = ZzFX (MIT)**, dibuat prosedural di browser; tanpa file audio. Kenney CC0 hanya cadangan.
- **Suara**: di menu digital customer Aya **bicara + SFX** setelah customer menyentuh layar (aturan autoplay browser).
  Di **POS, KDS, dan Production Hub suara & SFX Aya MATI secara bawaan** (tidak tertukar dengan bunyi pesanan); teks tetap tampil.
  Notifikasi operasional selalu menang atas suara Aya.
- **Urutan**: A3 `feat/aya-v2-rig` (animasi berlapis: kedip, tangan menunjuk, efek lucu) → A2 `feat/aya-v2-order-guide`
  (scroll + terbang + tunjuk + sorot di `/order`) → A4 `feat/aya-v2-voice-sfx` (bank kalimat bijak/lucu/imut, Web Speech, ZzFX).
