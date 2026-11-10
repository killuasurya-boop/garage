# AYA V2 — Rencana: animasi lebih hidup, bicara, SFX, scroll memandu (4 Nov 2026)

Permintaan Owner: "Animasi upgrade, bisa bicara yang bijak, lucu dan imut, sound effect saat berpindah/mengarahkan,
bisa scroll sendiri, efek lucu — planning dahulu, cek repo GitHub dan MCP gratis yang mendukung."

Batasan yang berlaku: OD-01 (customer tetap pesan, Aya memandu), OD-02 (karakter V2), **OD-03 mode Rp 0**
(tanpa layanan berbayar; semua di browser). Dasar: PR #164 (`AyaMascot`, 8 state, animasi CSS).

## 1. Yang dibangun

### 1a. Animasi "rig" (A3)
SVG V2 dipecah menjadi lapisan React inline (badan, mata, mulut, tangan kiri/kanan, antena, pipi, syal) dengan
`useId` agar id gradient unik. Dengan lapisan terpisah:
- **Kedip acak** (3–7 dtk), **mata mengikuti** arah tujuan, **tangan menunjuk** sungguhan (state `guiding`), melambai dengan tangan, antena bergoyang.
- **Squash & stretch** saat mendarat, **jalur terbang melengkung** (bukan garis lurus), **"plop"** saat muncul.
- **Efek lucu** (semua CSS/framer-motion, tanpa aset berat): bintang/kilau saat sukses, hati kecil saat Aya diketuk, pusing berputar bila diseret cepat lalu dilepas, pipi merona saat dipuji, "zzz" saat mengantuk, mengintip dari tepi layar saat dipanggil kembali.
- Mesin gerak: **framer-motion (sudah terpasang di repo)** + CSS. Tidak menambah library animasi.
- Fallback `<img>` 8 state (PR #164) tetap dipakai untuk avatar kecil & mode hemat (POS/KDS) dan `prefers-reduced-motion`.

### 1b. Aya memandu + scroll sendiri (A2, diperluas)
- Komponen `data-aya-anchor="…"` di tombol `/order` (tambah item, keranjang, checkout, upload bukti bayar, Instagram, lokasi).
- Saat customer menekan "Tunjukkan caranya" / bertanya: halaman **di-scroll halus** ke tombol, Aya **terbang** ke sampingnya,
  **menunjuk dengan tangan**, tombol disorot (spotlight), balon menjelaskan langkahnya → "Lanjut" ke langkah berikut.
- Aturan: scroll hanya setelah customer meminta (tidak menarik layar saat orang membaca); berhenti bila customer men-scroll sendiri;
  `prefers-reduced-motion` → lompat tanpa animasi; sorotan tidak menangkap klik; tidak menunjuk checkout saat outlet tutup.
- Implementasi sendiri (scrollIntoView + framer-motion) — kecil & sesuai gaya Garage. Alternatif siap pakai: **Driver.js (MIT)**.

### 1c. Bicara: bijak, lucu, imut (A4)
- **Bank kalimat Aya** (Bahasa Indonesia, template, tanpa AI berbayar): sapaan sesuai jam, panduan langkah pesan, kata bijak ala barista,
  tebak-tebakan/plesetan kopi, semangat untuk staf, ucapan saat sukses. Maks 2 kalimat; tidak mengarang harga/promo/stok —
  angka hanya dari data sistem.
- Pisah per peran: customer (ramah, ajak pesan), staf (semangat & pengingat singkat, tidak saat jam ramai), Owner (ringkas).
  Tidak mengulang kalimat yang sama dalam satu sesi; ada jeda minimum antar celetukan.
- **Suara**: Web Speech API browser (`id-ID`, nada sedikit tinggi = imut), memakai `garage-voice.ts` yang sudah ada.
  Mulut bergerak mengikuti event kata (`onboundary`) — sinkron kasar, gratis. **Teks/caption selalu tampil.**
  Kualitas suara tergantung perangkat (Chrome Android/Edge Windows punya suara Indonesia; perangkat lain bisa robotik).
- Tidak bersuara sebelum pengguna berinteraksi (aturan browser); tombol mute & volume.

### 1d. Sound effect (A4)
- Kandidat utama **ZzFX (MIT, ±1 KB)**: suara dibuat prosedural di browser (whoosh terbang, pop muncul, boing mendarat, kilau sukses,
  tik saat menunjuk) — tanpa file audio, tanpa urusan lisensi aset.
- Alternatif berbasis file: **Kenney "Interface Sounds" / "UI Audio" (CC0)**.
- Kanal SFX Aya terpisah dari notifikasi operasional (`public/audio/smart-notif/…`): **notifikasi operasional selalu menang**;
  SFX Aya **mati secara bawaan di POS/KDS/Production Hub**; volume, mute, dan cooldown agar tidak berisik.

## 2. Repo GitHub — dicek 4 Nov 2026 (lisensi dari GitHub API)

| Repo | Lisensi | Status | Keputusan |
|---|---|---|---|
| motiondivision/motion (framer-motion) | MIT | aktif, ★34,8k, **sudah di repo** | **Pakai** (animasi rig, jalur terbang) |
| KilledByAPixel/ZzFX | MIT | aktif | **Pakai** (SFX prosedural) |
| kenney.nl Interface Sounds / UI Audio | CC0 | — | Cadangan SFX berbasis file |
| nilbuild/driver.js (dulu kamranahmedse) | MIT | aktif, ★27k | Opsional untuk sorotan/tur |
| goldfire/howler.js | MIT | aktif | Opsional bila butuh mixer audio; Web Audio API cukup |
| joshwcomeau/use-sound | MIT | jarang update | Tidak perlu |
| rive-app/rive-react, LottieFiles/dotlottie-web, airbnb/lottie-web | MIT (runtime) | aktif | Tahap premium (P2): butuh file animasi buatan desainer |
| DanielSWolf/rhubarb-lip-sync | MIT | aktif | Hanya untuk audio rekaman; tidak untuk Web Speech |
| juliangarnier/anime | MIT | aktif | Tidak perlu (framer-motion sudah ada) |
| shipshapecode/shepherd | **AGPL-3.0 / komersial** | — | **Hindari** |
| usablica/intro.js | **lisensi komersial** (v2+) | — | **Hindari** |
| OHF-Voice/piper1-gpl (TTS) | **GPL-3.0**, butuh CPU server | — | **Hindari** (rhasspy/piper MIT sudah diarsipkan) |
| greensock/GSAP | lisensi khusus GSAP (bukan OSI) | — | Tidak perlu |

## 3. MCP gratis untuk agent pengembang (bukan runtime Aya)

| MCP | Lisensi | Kegunaan di proyek ini |
|---|---|---|
| microsoft/playwright-mcp | Apache-2.0 | QA otomatis alur `/order` + panduan Aya di 3 ukuran layar, screenshot bukti |
| ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | Ukur FPS/CPU animasi (profil tablet), cek konsol & jaringan (bukti tidak ada panggilan berbayar) |
| github/github-mcp-server | MIT | PR/issue/review (opsional; `gh` CLI sudah cukup) |
| upstash/context7 | MIT (layanan, ada batas gratis) | Dokumentasi terbaru framer-motion/Web Speech/driver.js saat coding |

Runtime Aya tetap Rp 0: semua di browser pengguna.

## 4. Urutan kerja (tiap butir = branch + PR + release-check)
1. **A3 `feat/aya-v2-rig`** — rig SVG berlapis + kedip, tangan menunjuk, squash/stretch, efek lucu; fallback `<img>` tetap.
2. **A2 `feat/aya-v2-order-guide`** — anchor `/order`, scroll + terbang + tunjuk + sorot, langkah cara pesan (OD-01).
3. **A4 `feat/aya-v2-voice-sfx`** — bank kalimat, Web Speech + mulut ikut kata, ZzFX, kanal & aturan suara.

Gate tiap PR: tes unit + E2E alur pesan `/order` tetap lulus, reduced-motion, tidak menutupi tombol, tidak ada panggilan
ke layanan berbayar (dibuktikan), FPS layak di profil tablet, konsol bersih.
