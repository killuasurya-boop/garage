# GARAGE — Suara, Naskah, dan Export MP3 (satu panduan)

Dokumen tunggal untuk:
- suara **CEO Executive Assistant** dan operasional GARAGE,
- **18 naskah Bahasa Indonesia** siap generate MP3,
- pengaturan **Edge TTS (gratis)** / ElevenLabs / browser,
- prompt **Claude** untuk naskah baru,
- cara **import MP3** ke aplikasi lain.

**File teknis naskah:** `content/voice-scripts/garage-voice-id.json`  
**MP3 hasil generate:** `exports/voice-mp3/`  
**Perintah:** `npm run voice:generate-mp3`

Panduan AI pengawasan: [GARAGE-AI-WORKFLOW.md](./GARAGE-AI-WORKFLOW.md)

---

## 1. Ringkasan cepat

| Kebutuhan | Solusi |
| --- | --- |
| Suara Smart Notification (utama) | **File MP3 lokal** di `public/voice/scenarios/` |
| Suara CEO live di app | **File lokal** / Edge / ElevenLabs (CEO masih bisa dinamis) |
| Hindari suara Inggris Windows | Pilih **File MP3 lokal**, bukan Browser TTS |
| File MP3 untuk CapCut / WA / arsip | Edit JSON → `npm run voice:generate-mp3` |
| Naskah baru | Pakai prompt Claude (bagian 6) → tempel ke JSON |

---

## 2. Tiga mode suara di Garage OS

| Mode | Biaya | Kualitas | Kapan dipakai |
| --- | --- | --- | --- |
| **Edge TTS** | Gratis | Mirip manusia (neural) | Default — `id-ID-GadisNeural` |
| **ElevenLabs** | Berbayar | Sangat natural | Jika ada API key di server |
| **Browser TTS** | Gratis | Robot, sering Inggris di Windows | Hanya cadangan |

**Urutan mode Otomatis:** Edge → ElevenLabs (jika key ada) → browser.

### Persona GARAGE Hospitality (default)

Suara pengumuman operasional: **wanita Indonesia (Gadis)**, ramah, tegas, sedikit cepat, mudah didengar.

| Channel | Voice | Rate | Pitch | Nada |
| --- | --- | --- | --- | --- |
| Kasir / Bar / CEO | `id-ID-GadisNeural` | `+6%` | `+1Hz` | Hangat, jelas |
| Dapur | Gadis | `+4%` | `+0Hz` | Ramah & tegas |
| Peringatan | Gadis | `+8%` | `+0Hz` | Tegas & cepat |

Naskah live memakai pembuka **Hai…** / **Tim…**, bukan *Perhatian* kaku. Kode: [`src/lib/edge-tts-garage.ts`](../src/lib/edge-tts-garage.ts) (`GARAGE_HOSPITALITY_PROSODY`), [`src/lib/garage-voice.ts`](../src/lib/garage-voice.ts) (`SCENARIO_META`).

Jika terlalu cepat: set `EDGE_TTS_RATE=+4%` di `.env.local`.

### Pengaturan UI

1. Buka **Smart Notification Center** (ikon mic / pengaturan suara).
2. **Suara Smart Notification** → pilih **File MP3 lokal — utama** (default).
3. Bagian **Suara CEO Assistant** → **Otomatis** atau **Edge neural**.
4. Aktifkan **Voice ON**, lalu **Test** skenario atau **Tes CEO** — harus Bahasa Indonesia.
5. Jangan pakai **Browser** kecuali server Edge mati (bisa suara Inggris Windows).

### Environment server (`.env.local` / Vercel)

**Edge TTS (gratis, default aktif):**

```env
EDGE_TTS_ENABLED="true"
EDGE_TTS_VOICE="id-ID-GadisNeural"
EDGE_TTS_RATE="+6%"
EDGE_TTS_PITCH="+1Hz"
```

Voice pria Indonesia: `id-ID-ArdiNeural`

**ElevenLabs (opsional):**

```env
ELEVENLABS_API_KEY="sk-..."   # wajib jika pakai ElevenLabs
ELEVENLABS_VOICE_ID=""        # opsional — kosong = auto-pilih voice Indonesia
ELEVENLABS_MODEL_ID="eleven_multilingual_v2"
ELEVENLABS_TTS_ENABLED="true"
```

Tes & auto-setup voice:

```bash
npm run voice:test-elevenlabs
```

Menghasilkan sample `exports/voice-mp3/00-elevenlabs-tes-ceo.mp3` dan menulis `ELEVENLABS_VOICE_ID` ke `.env.local` jika masih kosong.

### API (Owner / Admin / Manager)

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/api/ai/tts/status` | Status Edge + ElevenLabs |
| POST | `/api/ai/tts` | Body: `{ "text", "provider": "auto" \| "edge" \| "elevenlabs" }` → audio MPEG |

---

## 3. Daftar 18 naskah (kerjakan satu per satu)

Edit teks di `content/voice-scripts/garage-voice-id.json` (field `"text"`), lalu:

```bash
npm run voice:generate-mp3 -- --id [ID]
```

Contoh: `npm run voice:generate-mp3 -- --id 02-briefing-pagi`

Generate semua: `npm run voice:generate-mp3`

---

### A. CEO Executive Assistant (7 naskah)

| No | ID | File MP3 | Naskah |
| --- | --- | --- | --- |
| 1 | `01-tes-suara` | `01-ceo-tes-suara.mp3` | Perhatian CEO GARAGE Coffee and Motor. Ini tes suara asisten eksekutif. Bahasa Indonesia, nada profesional, siap operasional. |
| 2 | `02-briefing-pagi` | `02-ceo-briefing-pagi.mp3` | Perhatian CEO GARAGE. Briefing shift pagi dimulai. Cek penjualan semalam, antrian dapur, dan stok kritis. Prioritaskan kecepatan layanan dan standar rasa. Terima kasih, selamat bekerja. |
| 3 | `03-briefing-sore` | `03-ceo-briefing-sore.mp3` | Perhatian CEO GARAGE. Briefing shift sore. Pantau penjualan sementara, jam sibuk meja dan online, serta kas harian. Jaga kecepatan dapur dan akurasi pembayaran. Lanjutkan standar GARAGE. |
| 4 | `04-setuju` | `04-ceo-keputusan-disetujui.mp3` | Perhatian CEO. Keputusan: disetujui. Usulan masih aman untuk margin, operasional, dan SOP. Silakan jalankan sesuai rencana dengan pengawasan supervisor. |
| 5 | `05-tolak` | `05-ceo-keputusan-ditolak.mp3` | Perhatian CEO. Keputusan: ditolak. Risiko operasional atau finansial terlalu tinggi, atau data belum lengkap. Gunakan alternatif yang lebih aman terlebih dahulu. |
| 6 | `06-tinjauan` | `06-ceo-perlu-tinjauan.mp3` | Perhatian CEO. Keputusan: perlu tinjauan. Data belum cukup untuk putusan final. Kumpulkan angka terbaru, lalu ajukan ulang dengan bukti lengkap. |
| 7 | `07-prioritas-kritis` | `07-ceo-prioritas-kritis.mp3` | Perhatian CEO. Prioritas kritis shift ini. Fokus pada antrian dapur, kas, dan stok kritis. Tunda hal non mendesak. Supervisor koordinasi sekarang. |

**Urutan disarankan:** 01 → 02 → 03 → 04 → 05 → 06 → 07

---

### B. Pengawasan karyawan / lonceng (5 naskah)

| No | ID | File MP3 | Naskah |
| --- | --- | --- | --- |
| 8 | `10-qr-pending` | `10-pengingat-qr-pending.mp3` | Perhatian kasir dan waiter. Ada pesanan QR meja yang belum diproses. Segera terima atau tolak sesuai SOP. Supervisor sudah diberi tahu. |
| 9 | `11-pembayaran-pending` | `11-pengingat-pembayaran-pending.mp3` | Perhatian kasir. Ada order yang sudah diterima tetapi pembayaran masih tertunda. Selesaikan pembayaran atau eskalasi ke supervisor sekarang. |
| 10 | `12-kitchen-delay` | `12-pengingat-kitchen-delay.mp3` | Perhatian tim dapur dan bar. Antrian masak melewati target waktu. Percepat ticket cooking dan koordinasi dengan kasir untuk update pelanggan. |
| 11 | `13-stok-kritis` | `13-pengingat-stok-kritis.mp3` | Perhatian gudang dan manager. Ada bahan stok kritis atau mendekati minimum. Segera cek persediaan dan ajukan pengadaan jika diperlukan. |
| 12 | `14-approval-menumpuk` | `14-pengingat-approval-menumpuk.mp3` | Perhatian manager dan finance. Ada approval yang tertunda terlalu lama. Segera tinjau dan putuskan agar operasional tidak tertahan. |

---

### C. Operasional POS & dapur (6 naskah)

| No | ID | File MP3 | Naskah |
| --- | --- | --- | --- |
| 13 | `20-order-masuk` | `20-order-masuk-kasir.mp3` | Perhatian kasir. Order baru masuk. Segera konfirmasi dan arahkan ke dapur sesuai alur GARAGE. |
| 14 | `21-qr-masuk` | `21-order-qr-masuk.mp3` | Perhatian kasir. Pesanan QR meja baru masuk. Periksa detail meja dan waktu pesanan sekarang. |
| 15 | `22-masak` | `22-kitchen-mulai-masak.mp3` | Perhatian dapur. Ticket masuk antrian cooking. Mulai persiapan sesuai prioritas waktu pesanan. |
| 16 | `23-siap` | `23-order-siap-ambil.mp3` | Perhatian kasir dan runner. Pesanan sudah siap diambil. Segera antar ke meja atau serahkan ke pelanggan. |
| 17 | `24-printer` | `24-peringatan-printer.mp3` | Perhatian kasir. Printer struk bermasalah. Cek koneksi dan kertas, lalu uji cetak ulang. |
| 18 | `25-stok-rendah` | `25-peringatan-stok-rendah.mp3` | Perhatian gudang. Ada item stok rendah. Segera cek on hand dan rencanakan pengisian ulang. |

---

## 4. File MP3 untuk Smart Notification (sumber utama)

File dipakai langsung oleh app dari:

`public/voice/scenarios/*.mp3`

Generate / update (sekali atau setelah ubah naskah):

```bash
npm run voice:publish-scenarios
```

Mapping skenario → file: [`content/voice-scripts/scenario-audio.json`](../content/voice-scripts/scenario-audio.json)

| Skenario | File |
| --- | --- |
| order_new | `order-new.mp3` |
| airport_qr | `airport-qr.mp3` |
| online_new | `online-new.mp3` |
| kitchen_cooking | `kitchen-cooking.mp3` |
| bar_mixing | `bar-mixing.mp3` |
| order_ready | `order-ready.mp3` |
| order_ready_deliver | `order-ready-deliver.mp3` |
| warning_printer | `warning-printer.mp3` |
| warning_lowstock | `warning-lowstock.mp3` |

Urutan pemutaran: **MP3 lokal** → (jika Otomatis & file hilang) Edge TTS → browser.

Catatan: audio MP3 memakai naskah **generik** (tanpa nama pelanggan di suara); teks di log UI tetap detail dari event.

## 5. Export MP3 arsip — perintah lengkap

```bash
# Semua naskah (folder exports, untuk CapCut/WA)
npm run voice:generate-mp3

# Skenario operasional → public (untuk app)
npm run voice:publish-scenarios

# Satu pack
npm run voice:generate-mp3 -- --pack executive-ceo
npm run voice:generate-mp3 -- --pack pengawasan-staf
npm run voice:generate-mp3 -- --pack operasional-pos

# Satu file by ID
npm run voice:generate-mp3 -- --id 01-tes-suara

# Lihat daftar tanpa generate
npm run voice:generate-mp3 -- --dry-run
```

**Output:** folder `exports/voice-mp3/` + `index.json` (daftar file & ukuran).

### Import MP3 ke aplikasi lain

1. Buka `exports/voice-mp3/`.
2. Drag `.mp3` ke CapCut, Canva, WhatsApp, OBS, atau penyimpanan lokal.
3. Format standar MPEG audio.

> MP3 statis ≠ suara live CEO di app. Live tetap lewat Edge/ElevenLabs saat chat Executive Assistant.

### Tambah naskah ke-19, ke-20, …

Di `garage-voice-id.json`, tambah item di pack yang sesuai:

```json
{
  "id": "08-diskon-shift",
  "file": "08-ceo-diskon-shift.mp3",
  "text": "Perhatian CEO. Diskon shift ini masih dalam batas aman. Pantau margin sampai tutup kas."
}
```

Lalu: `npm run voice:generate-mp3 -- --id 08-diskon-shift`

---

## 5. Template naskah (salin & isi)

### Briefing shift
```text
Perhatian CEO GARAGE. Briefing shift [pagi/sore] outlet [nama].
Penjualan sementara [angka] rupiah. Antrian dapur [ringkas].
Stok kritis: [item atau tidak ada].
Prioritas: [satu aksi]. Lanjutkan standar GARAGE.
```

### Keputusan disetujui
```text
Perhatian CEO. Keputusan: disetujui.
Topik: [diskon / pengeluaran / stok].
Alasan: [satu kalimat berbasis data].
Tindakan: [langkah staf].
Prioritas: [rendah / sedang / tinggi / kritis].
```

### Keputusan ditolak
```text
Perhatian CEO. Keputusan: ditolak.
Topik: [topik].
Alasan: [risiko atau SOP].
Alternatif: [saran aman].
```

### Pengingat staf
```text
Perhatian tim [kasir / dapur / gudang].
Pengingat: [masalah singkat].
Perbaiki: [langkah konkret].
Batas waktu: [menit].
Supervisor sudah diberi tahu.
```

---

## 6. Prompt Claude (naskah baru)

### System prompt (Project Claude)

```text
Kamu penulis naskah suara GARAGE Coffee & Motor — Executive Assistant CEO.

ATURAN:
- Hanya Bahasa Indonesia. Dilarang Inggris kecuali merek: GoFood, GrabFood, POS, QR.
- Untuk dibacakan: wanita profesional Indonesia, announcer eksekutif, bukan robot.
- Kalimat pendek. Tanpa markdown, emoji, bullet, label Inggris.
- Gunakan: DISETUJUI, DITOLAK, PERLU TINJAUAN (bukan APPROVED/REJECTED).
- Max ~350–400 karakter kecuali diminta panjang.
- Jangan "sebagai AI", "hello", angka tanpa konteks.

OUTPUT: hanya naskah suara, kecuali diminta versi chat terpisah.
```

### Prompt per naskah

```text
Buatkan 1 naskah suara CEO GARAGE, Bahasa Indonesia saja, natural announcer wanita.
Topik: [ISI]
Konteks: outlet [nama], shift [pagi/sore], data [opsional]
Max 400 karakter. Output: hanya paragraf naskah.
```

### Ubah jawaban chat → naskah suara

```text
Ubah jawaban di atas jadi SATU naskah suara Bahasa Indonesia.
Tanpa Inggris, markdown, bullet, label [STATUS].
Ganti APPROVED→DISETUJUI, REJECTED→DITOLAK, NEED REVIEW→PERLU TINJAUAN.
Max 400 karakter. Output: hanya paragraf naskah.
```

### Anti-robot

```text
Tulis ulang lebih natural seperti manusia Indonesia di radio operasional.
Hindari: "dengan demikian", "oleh karena itu", "silakan diperhatikan".
Tetap profesional GARAGE. Max 400 karakter. Bahasa Indonesia murni.

Naskah lama:
[PASTE]
```

---

## 7. Contoh bagus vs buruk

| Buruk | Bagus |
| --- | --- |
| APPROVED. Discount is OK. | Perhatian CEO. Keputusan: disetujui. Diskon masih aman untuk margin. |
| Hello team, check kitchen. | Perhatian tim dapur. Antrian masak tertinggal. Percepat ticket sekarang. |
| Revenue is good today. | Penjualan shift ini di atas target. Pertahankan kecepatan layanan. |

---

## 8. Kaitan dengan GARAGE AI

| Fitur | Suara |
| --- | --- |
| CEO Brain / Executive Assistant | Live TTS (Edge/ElevenLabs) dari jawaban chat |
| Lonceng pengawasan | Teks alert; bisa pakai MP3 manual jika Anda putar sendiri |
| POS / Kitchen announcement | Browser TTS di Smart Notification Center (channel kasir/dapur) |
| File MP3 di `exports/voice-mp3/` | Aset statis untuk training, video, atau backup offline |

Persona CEO di kode: `src/lib/garage-ai-persona.ts`  
Voice client: `src/lib/garage-voice.ts`  
Generator MP3: `src/scripts/generate-voice-mp3.ts`

---

## 9. Troubleshooting

| Masalah | Solusi |
| --- | --- |
| Suara masih Inggris | UI: **Edge neural** atau **Otomatis**, bukan Browser TTS |
| Tes CEO tidak bunyi | Klik area app dulu (unlock audio browser), volume OS naikkan |
| Generate MP3 gagal | Cek internet; ulang `npm run voice:generate-mp3` |
| File MP3 tidak ada | Cek folder `exports/voice-mp3/`, antivirus |
| ElevenLabs error | Opsional — pakai Edge saja tanpa key |
| Naskah terpotong di live CEO | Pendekkan teks chat atau max ~400 karakter untuk TTS |

---

## 10. Checklist sebelum produksi

- [ ] Semua naskah **Bahasa Indonesia** (review 18 item di JSON)
- [ ] Tes CEO di app dengan **Edge neural**
- [ ] Generate MP3: `npm run voice:generate-mp3`
- [ ] Dengar satu per satu di `exports/voice-mp3/`
- [ ] Simpan salinan MP3 ke drive outlet (backup)
- [ ] (Opsional) Sesuaikan nama outlet di naskah briefing 02 & 03

---

## 11. Naskah opsional (belum di JSON — tambah jika perlu)

| Usulan ID | Topik | Catatan |
| --- | --- | --- |
| `08-void-order` | Void / pembatalan order | Approval + SOP |
| `09-diskon-meja` | Diskon meja / promo | Finance guard |
| `15-handover-shift` | Serah terima shift | Kas + stok |
| `16-tutup-kas` | Tutup kas harian | Finance |
| `26-gofood-masuk` | Order GoFood masuk | Channel online |
| `27-meja-panggil` | Pelanggan panggil waiter | Floor |

Tambahkan ke `garage-voice-id.json` mengikuti format item yang ada.

---

*Terakhir diselaraskan dengan `content/voice-scripts/garage-voice-id.json` — 18 naskah bawaan.*
