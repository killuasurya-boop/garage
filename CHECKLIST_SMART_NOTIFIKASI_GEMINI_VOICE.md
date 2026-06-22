# CHECKLIST SMART NOTIFIKASI GEMINI VOICE — GARAGE OS

## 1. Tujuan Update

Update ini bertujuan memperkuat fitur Smart Notifikasi yang sudah ada agar:
* Smart Notifikasi memiliki suara operasional khas Garage.
* Suara menggunakan Google Gemini TTS.
* Karakter suara: wanita, formal, tenang, jelas, ala announcer stasiun/terminal.
* Setiap notifikasi pesanan menyebut nomor meja jika tersedia.
* Ada chime original Garage “ding ding ding” sebelum suara.
* Audio bisa dibuat permanen dan dipakai ulang.
* Sistem tetap berjalan walau API Gemini habis/error.
* POS, Kitchen, Waiter, Inventory, Finance, dan Owner/CEO Control tetap aman dan cepat.

## 2. Prinsip Implementasi

* [ ] Update fitur Smart Notifikasi existing.
* [ ] Jangan membuat menu baru jika menu Smart Notifikasi sudah ada.
* [ ] Jangan membuat module duplikat.
* [ ] Jangan hardcode API key.
* [ ] Jangan expose API key ke client.
* [ ] Gunakan Gemini hanya di server.
* [ ] Audio utama operasional harus menggunakan file permanen.
* [ ] Gemini TTS hanya dipakai untuk generate asset baru.
* [ ] Chime “ding ding ding” harus file terpisah.
* [ ] Voice wanita harus konsisten.
* [ ] Semua payload harus divalidasi Zod.
* [ ] Semua endpoint private wajib auth dan permission.
* [ ] Jika Gemini error, fallback audio tetap jalan.

## 3. Behavior Suara Pesanan

### POS Order Created

Jika ada meja:
“Ding ding ding. Perhatian. Pesanan baru meja {tableNo} telah masuk ke dapur.”

Jika ada meja dan order number ingin disebut:
“Ding ding ding. Perhatian. Pesanan baru meja {tableNo}, nomor {orderNo}, telah masuk ke dapur.”

Jika tidak ada meja:
“Ding ding ding. Perhatian. Pesanan baru telah masuk ke dapur.”

> **Catatan:** Untuk audio permanen, prioritaskan versi yang menyebut meja saja agar bisa dipakai ulang: “Pesanan baru meja tujuh telah masuk ke dapur.” Nomor order tetap ditampilkan di layar POS/KDS.

### Kitchen Order Ready

Jika ada meja:
“Ding ding ding. Pesanan meja {tableNo} sudah siap diantar.”

Jika ada order number:
“Ding ding ding. Pesanan meja {tableNo}, nomor {orderNo}, sudah siap diantar.”

Jika tidak ada meja:
“Ding ding ding. Ada pesanan siap diantar.”

### Waiter Order Ready

Jika ada meja:
“Waiter. Pesanan meja {tableNo} siap diantar.”

Jika tidak ada meja:
“Waiter. Ada pesanan siap diantar.”

### Kitchen SLA Warning

Jika ada meja:
“Perhatian dapur. Pesanan meja {tableNo} telah melewati batas waktu layanan.”

Jika ada order number:
“Perhatian dapur. Pesanan meja {tableNo}, nomor {orderNo}, telah melewati batas waktu layanan.”

Jika tidak ada meja:
“Perhatian dapur. Ada pesanan yang telah melewati batas waktu layanan.”

## 4. Karakter Suara Gemini TTS

```txt
Voice direction:
Use a clear Indonesian female station announcer voice.
Tone: formal, calm, operational, premium, and easy to understand.
Style: like a train station or terminal announcement, but original for Garage OS.
Pace: medium, not too slow, not too fast.
Emotion: professional and helpful.
Pronunciation: Indonesian language, clear table numbers.
Do not imitate any real station, company, or copyrighted jingle.

Transcript:
{message}
```

* [ ] Voice wanita.
* [ ] Bahasa Indonesia.
* [ ] Gaya announcer stasiun/terminal.
* [ ] Tidak terlalu dramatis.
* [ ] Tidak berteriak.
* [ ] Cocok untuk cafe/garage operation.
* [ ] Angka meja dibaca jelas.
* [ ] Output audio disimpan permanen.

## 5. Strategi Chime “Ding Ding Ding”

Chime jangan digabung langsung dengan voice Gemini.
Gunakan file chime terpisah:
```txt
public/audio/smart-notif/chime/garage-station-ding-ding.mp3
```

Flow audio:
1. Play chime “ding ding ding”.
2. Setelah chime selesai, play voice Gemini.
3. Jika voice gagal, play fallback voice.
4. Jika browser memblokir autoplay, tampilkan toast: “Aktifkan Smart Voice terlebih dahulu.”

* [ ] Chime file terpisah.
* [ ] Chime original Garage.
* [ ] Jangan meniru jingle resmi stasiun/brand tertentu.
* [ ] Chime pendek, maksimal 1–2 detik.
* [ ] Chime tidak mengganggu kasir/dapur.
* [ ] Chime bisa dimatikan lewat setting.
* [ ] Chime bisa dipakai ulang untuk semua trigger.

## 6. Strategi Audio Permanen

Flow:
```txt
Trigger notifikasi masuk
↓
Build message berdasarkan triggerKey + payload
↓
Cek audio permanen berdasarkan trigger dan tableNo
↓
Jika audio permanen ada:
  return audioUrl permanent
↓
Jika belum ada dan auto-generate ON:
  generate dengan Gemini TTS
  simpan ke storage
  return audioUrl generated
↓
Jika Gemini error/API habis/quota habis:
  return fallback audio
↓
Simpan notification log
```

* [ ] Jangan generate Gemini setiap order masuk.
* [ ] Cek audio permanen dulu.
* [ ] Jika audio permanen tersedia, Gemini tidak dipanggil.
* [ ] Jika audio tidak tersedia dan autogenerate off, pakai fallback.
* [ ] Jika Gemini error, pakai fallback.
* [ ] Notification log tetap disimpan.
* [ ] Response API tetap sukses selama fallback tersedia.

## 7. Struktur Folder Audio

```txt
public/audio/smart-notif/chime/garage-station-ding-ding.mp3

public/audio/smart-notif/generated/pos.order_created/table-1.wav
public/audio/smart-notif/generated/pos.order_created/table-2.wav
public/audio/smart-notif/generated/pos.order_created/table-3.wav

public/audio/smart-notif/generated/kitchen.order_ready/table-1.wav
public/audio/smart-notif/generated/kitchen.order_ready/table-2.wav

public/audio/smart-notif/generated/waiter.order_ready/table-1.wav
public/audio/smart-notif/generated/waiter.order_ready/table-2.wav

public/audio/smart-notif/generated/kitchen.sla_warning/table-1.wav
public/audio/smart-notif/generated/kitchen.sla_warning/table-2.wav

public/audio/smart-notif/fallback/order-created.wav
public/audio/smart-notif/fallback/kitchen-ready.wav
public/audio/smart-notif/fallback/waiter-ready.wav
public/audio/smart-notif/fallback/general-alert.wav
```

> **Catatan:** Jika ingin convert ke MP3, gunakan ffmpeg setelah file WAV dibuat. Jika deploy di Vercel/serverless:
> * Jangan tulis file runtime langsung ke folder `public`.
> * Untuk production, gunakan storage adapter seperti S3, Cloudflare R2, Supabase Storage, atau generate audio lokal lalu commit asset.
> * Buat abstraction storage agar local/prod bisa beda.

## 8. File yang Harus Diaudit

Command audit:
```bash
grep -R "smart" -n src
grep -R "notif" -n src
grep -R "notification" -n src
grep -R "voice" -n src
grep -R "audio" -n src
grep -R "tableNo" -n src
grep -R "order_created" -n src
grep -R "kitchen" -n src
grep -R "waiter" -n src
grep -R "finance" -n src
grep -R "inventory" -n src
```

* [ ] Cari route Smart Notifikasi existing.
* [ ] Cari component Smart Notifikasi existing.
* [ ] Cari service/helper notifikasi existing.
* [ ] Cari schema database notification existing.
* [ ] Cari permission system existing.
* [ ] Cari audit log helper existing.
* [ ] Cari audio player existing.
* [ ] Cari POS order created trigger.
* [ ] Cari Kitchen KDS order ready trigger.
* [ ] Cari Waiter notification trigger.
* [ ] Jangan buat duplikat jika file sudah ada.

## 9. File yang Mungkin Diupdate

(Jangan langsung buat semua file. Audit dulu. Jika belum ada, baru buat):
```txt
src/lib/smart-notif-templates.ts
src/lib/smart-notif-service.ts
src/lib/smart-notif-voice-assets.ts
src/lib/gemini-tts.ts
src/app/api/smart-notif/trigger/route.ts
src/app/api/smart-notif/voice/route.ts
src/app/api/smart-notif/settings/route.ts
src/components/garage/smart-notif-center.tsx
src/components/garage/garage-voice-player.tsx
scripts/generate-smart-notif-gemini-audio.ts
```

## 10. Helper Function yang Dibutuhkan

```ts
buildSmartNotifMessage(triggerKey, payload)
buildGeminiVoicePrompt(message)
buildVoiceAssetKey(triggerKey, payload)
resolvePermanentVoiceUrl(triggerKey, payload)
resolveFallbackVoiceUrl(triggerKey)
shouldGenerateVoiceAsset(settings)
generateGeminiTtsAudio(prompt)
saveGeneratedVoiceAsset(assetKey, audioBuffer)
playGarageSmartVoice({ chimeUrl, audioUrl, fallbackUrl })
```

* [ ] Semua helper punya TypeScript type.
* [ ] Semua payload divalidasi Zod.
* [ ] Jangan crash jika payload tidak lengkap.
* [ ] Jangan expose Gemini API key ke client.
* [ ] Jangan import server-only code ke client component.
* [ ] Jangan panggil Gemini dari browser.

## 11. Gemini TTS Service

Buat/update file: `src/lib/gemini-tts.ts`

* [ ] Menggunakan package resmi Google Gen AI jika sudah ada.
* [ ] Menggunakan env `GEMINI_API_KEY`.
* [ ] Menggunakan model dari env `GEMINI_TTS_MODEL`.
* [ ] Menggunakan voice dari env `GEMINI_TTS_VOICE_NAME`.
* [ ] Request response modality audio.
* [ ] Simpan output sebagai WAV/PCM sesuai dokumentasi Google.
* [ ] Jangan print API key ke log.
* [ ] Error harus rapi.
* [ ] Jika API key kosong, throw error yang bisa ditangani fallback.

Contoh behavior:
```ts
generateGeminiTtsAudio({
  message: "Pesanan baru meja tujuh telah masuk ke dapur.",
  voiceDirection: "Indonesian female train station announcer voice..."
})
```
Output:
* `Buffer`
* `mimeType`
* `extension`

## 12. API Behavior

### POST `/api/smart-notif/trigger`

Request:
```json
{
  "triggerKey": "pos.order_created",
  "payload": {
    "tableNo": "7",
    "orderNo": "G-021"
  }
}
```

Response:
```json
{
  "message": "Ding ding ding. Perhatian. Pesanan baru meja 7, nomor G-021, telah masuk ke dapur.",
  "tableNo": "7",
  "orderNo": "G-021",
  "audioUrl": "/audio/smart-notif/generated/pos.order_created/table-7.wav",
  "audioSource": "permanent",
  "chimeUrl": "/audio/smart-notif/chime/garage-station-ding-ding.mp3"
}
```

* [ ] Endpoint private.
* [ ] Wajib auth.
* [ ] Wajib permission.
* [ ] Wajib Zod validation.
* [ ] Simpan notification log.
* [ ] Return audioUrl jika ada.
* [ ] Return fallback jika audio permanen belum ada.
* [ ] Jangan gagal total hanya karena Gemini error.
* [ ] Jangan expose server error mentah ke client.

## 13. Script Generate Audio Permanen

File: `scripts/generate-smart-notif-gemini-audio.ts`

* [ ] Generate audio meja 1 sampai 50.
* [ ] Generate trigger:
  * `pos.order_created`
  * `kitchen.order_ready`
  * `waiter.order_ready`
  * `kitchen.sla_warning`
* [ ] Menggunakan Google Gemini TTS.
* [ ] Menggunakan suara wanita announcer stasiun.
* [ ] Simpan sebagai WAV.
* [ ] Optional convert ke MP3 jika ffmpeg tersedia.
* [ ] Tidak overwrite file lama kecuali flag `--force`.
* [ ] Bisa dijalankan manual oleh developer.
* [ ] Aman jika env API key tidak ada.
* [ ] Log sukses/gagal.
* [ ] Tidak pernah print API key ke terminal.

Command contoh:
```bash
pnpm tsx scripts/generate-smart-notif-gemini-audio.ts --tables=1-50
pnpm tsx scripts/generate-smart-notif-gemini-audio.ts --tables=1-50 --force
pnpm tsx scripts/generate-smart-notif-gemini-audio.ts --tables=1-50 --format=mp3
```

## 14. UI Update Smart Notifikasi

Tambahkan section: **Voice Asset Gemini**

* [ ] Status Gemini API aktif/tidak.
* [ ] Status audio permanen tersedia.
* [ ] Status fallback aktif.
* [ ] Status chime aktif.
* [ ] Tombol “Preview Suara”.
* [ ] Tombol “Generate Audio Meja 1-50”.
* [ ] Tombol “Download Audio”.
* [ ] Toggle “Gunakan Fallback Saat Gemini Habis”.
* [ ] Toggle “Auto Generate Voice Asset”.
* [ ] Pilih voice name.
* [ ] Pilih model Gemini TTS.
* [ ] Volume control.
* [ ] Cooldown per trigger.
* [ ] UI responsive untuk tablet POS/KDS.
* [ ] Style sesuai Garage OS, industrial premium, bukan SaaS generik.

## 15. Database Update Jika Dibutuhkan

### voice settings
```txt
geminiTtsEnabled boolean default true
geminiTtsModel string default "gemini-3.1-flash-tts-preview"
geminiTtsVoiceName string nullable
autoGenerateVoiceAsset boolean default false
voiceStorageProvider string default "local"
fallbackAudioUrl string nullable
chimeAudioUrl string default "/audio/smart-notif/chime/garage-station-ding-ding.mp3"
```

### notification logs
```txt
tableNo string nullable
orderNo string nullable
audioUrl string nullable
audioSource string nullable
voiceGeneratedAt timestamp nullable
ttsProvider string nullable
```

* [ ] Migration aman.
* [ ] Tidak merusak data lama.
* [ ] Default value jelas.
* [ ] Build tidak butuh DB live saat import.

## 16. Permission & Security

* [ ] API key Gemini hanya di server.
* [ ] Tidak ada `NEXT_PUBLIC_GEMINI_API_KEY`.
* [ ] `.env` tidak dicommit.
* [ ] User tanpa permission tidak bisa manage Smart Notifikasi.
* [ ] User operasional hanya bisa receive/play notif sesuai role.
* [ ] Finance alert hanya untuk finance/owner.
* [ ] CEO risk alert hanya untuk owner/CEO.
* [ ] Semua update settings masuk audit log.
* [ ] Semua generate audio masuk audit log.
* [ ] Jangan log prompt yang berisi data sensitif.

## 17. Testing Checklist

### POS
* [ ] Order meja 7 masuk, suara menyebut meja 7.
* [ ] Order tanpa meja tetap tidak error.
* [ ] Order tanpa order number tetap tidak error.
* [ ] POS tidak memanggil Gemini jika audio permanen sudah ada.

### Kitchen
* [ ] Kitchen ready meja 3 menyebut meja 3.
* [ ] Kitchen SLA warning menyebut meja jika tersedia.
* [ ] Kitchen tablet tidak lambat saat audio diputar.

### Waiter
* [ ] Waiter menerima suara “Pesanan meja X siap diantar”.
* [ ] Waiter tidak menerima alert yang bukan role-nya.

### Gemini/Fallback
* [ ] Jika `GEMINI_API_KEY` kosong, sistem tetap pakai fallback.
* [ ] Jika Gemini error, sistem tetap pakai fallback.
* [ ] Jika quota habis, sistem tetap pakai fallback.
* [ ] Jika audio permanen tidak ada dan auto-generate off, sistem pakai fallback.
* [ ] Jika audio permanen ada, `audioSource = permanent`.
* [ ] Jika Gemini generate sukses, file tersimpan permanen.

### Browser Audio
* [ ] Jika autoplay diblokir, tampilkan toast “Aktifkan Smart Voice terlebih dahulu.”
* [ ] Setelah tombol Enable Smart Voice ditekan, audio bisa berjalan.
* [ ] Chime diputar sebelum voice.
* [ ] Cooldown mencegah spam suara.

### Build
* [ ] `pnpm lint` berhasil.
* [ ] `pnpm build` berhasil.
* [ ] Tidak ada API key muncul di client bundle.
* [ ] Tidak ada duplicate route/module/menu.
* [ ] Tidak ada import server-only Gemini code di client component.

## 18. Acceptance Criteria

Fitur dianggap selesai jika:
* [ ] Smart Notifikasi tetap memakai modul existing.
* [ ] Tidak ada fitur/menu duplikat.
* [ ] Provider TTS berubah ke Google Gemini.
* [ ] Suara wanita announcer stasiun tersedia.
* [ ] Chime “ding ding ding” original Garage tersedia.
* [ ] Pesanan menyebut nomor meja saat tersedia.
* [ ] Audio permanen bisa digunakan tanpa Gemini runtime.
* [ ] Fallback audio bekerja saat API habis/error.
* [ ] Script generate audio tersedia.
* [ ] UI settings voice asset tersedia.
* [ ] Permission, validation, audit log, dan fallback aman.
* [ ] Build dan lint berhasil.

## 19. Urutan Implementasi yang Disarankan

1. Audit Smart Notifikasi existing.
2. Cari trigger POS/Kitchen/Waiter existing.
3. Update template message agar menyebut tableNo.
4. Buat Gemini TTS service server-only.
5. Buat voice asset resolver.
6. Buat fallback audio resolver.
7. Buat script generate audio meja 1-50.
8. Update API trigger agar return audioUrl + chimeUrl.
9. Update audio player agar play chime lalu voice.
10. Update UI settings Smart Notifikasi.
11. Tambahkan audit log.
12. Jalankan lint/build/test manual.

## 20. Catatan Penting Developer

* Jangan gunakan ElevenLabs lagi untuk update ini.
* Gunakan Google Gemini TTS.
* Jangan expose API key.
* Jangan generate suara setiap transaksi jika audio permanen sudah ada.
* Mode terbaik operasional adalah permanent voice asset.
* Nomor order tetap tampil di layar, tetapi suara operasional fokus pada nomor meja agar staff cepat bergerak.
* Chime harus original Garage, hanya terinspirasi suasana stasiun/terminal.
* Jangan meniru jingle resmi stasiun/brand mana pun.
