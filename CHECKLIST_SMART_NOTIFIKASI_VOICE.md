# CHECKLIST SMART NOTIFIKASI VOICE — GARAGE OS

## 1. Tujuan Update

Update ini bukan untuk membuat fitur baru, melainkan memperkuat fitur Smart Notifikasi yang sudah ada agar:
* Menyebut nomor meja pada notifikasi pesanan.
* Memiliki suara wanita operasional ala announcer stasiun/terminal.
* Memakai chime khas Garage.
* Mendukung audio permanen hasil generate ElevenLabs.
* Tetap bisa jalan saat API key habis menggunakan fallback audio.
* Aman untuk POS, Kitchen, Waiter, Inventory, Finance, dan Owner/CEO Control.

## 2. Scope Pekerjaan

* [ ] Audit fitur Smart Notifikasi yang sudah ada.
* [ ] Cari file/component/API route yang sudah terkait Smart Notifikasi.
* [ ] Pastikan tidak membuat menu/module duplikat.
* [ ] Tambahkan logic `tableNo` pada template suara pesanan.
* [ ] Tambahkan fallback jika `tableNo` kosong.
* [ ] Tambahkan fallback jika `orderNo` kosong.
* [ ] Tambahkan sistem permanent voice asset.
* [ ] Tambahkan script generate/download audio ElevenLabs.
* [ ] Tambahkan UI settings untuk melihat status audio permanen.
* [ ] Tambahkan audit log untuk perubahan settings.
* [ ] Tambahkan permission check.
* [ ] Tambahkan test checklist.

## 3. Behavior Suara Pesanan

### POS Order Created

Jika ada meja:
“Ding ding ding. Perhatian. Pesanan baru meja {tableNo}, nomor {orderNo}, telah masuk ke dapur.”

Jika tidak ada meja:
“Ding ding ding. Perhatian. Pesanan baru nomor {orderNo} telah masuk ke dapur.”

Jika tidak ada order number:
“Ding ding ding. Perhatian. Pesanan baru telah masuk ke dapur.”

### Kitchen Order Ready

Jika ada meja:
“Ding ding ding. Pesanan meja {tableNo}, nomor {orderNo}, sudah siap diantar.”

Jika tidak ada meja:
“Ding ding ding. Pesanan nomor {orderNo} sudah siap diantar.”

### Waiter Order Ready

Jika ada meja:
“Waiter. Pesanan meja {tableNo} siap diantar.”

Jika tidak ada meja:
“Waiter. Ada pesanan siap diantar.”

### Kitchen SLA Warning

Jika ada meja:
“Perhatian dapur. Pesanan meja {tableNo}, nomor {orderNo}, telah melewati batas waktu layanan.”

Jika tidak ada meja:
“Perhatian dapur. Ada pesanan yang telah melewati batas waktu layanan.”

## 4. Strategi Audio Permanen

Flow Eksekusi:
1. Trigger notifikasi masuk.
2. Sistem build message berdasarkan `triggerKey` dan `payload`.
3. Sistem cek apakah audio permanen tersedia.
4. Jika tersedia, gunakan audio permanen.
5. Jika belum tersedia dan auto-generate aktif, generate via ElevenLabs.
6. Simpan hasil audio ke storage permanen.
7. Return audio URL.
8. Jika ElevenLabs gagal/API habis/quota habis, gunakan fallback audio.
9. Sistem tetap mencatat notification log.

* [ ] Jangan panggil ElevenLabs setiap order jika file audio sudah tersedia.
* [ ] Audio operasional utama harus pakai file permanen.
* [ ] ElevenLabs hanya dipakai untuk generate asset baru.
* [ ] Fallback audio wajib tersedia.
* [ ] Chime wajib terpisah dari voice agar bisa dipakai ulang.

## 5. Struktur Folder Audio

```txt
public/audio/smart-notif/chime/garage-station-chime.mp3

public/audio/smart-notif/generated/pos.order_created/table-1.mp3
public/audio/smart-notif/generated/pos.order_created/table-2.mp3
public/audio/smart-notif/generated/pos.order_created/table-3.mp3

public/audio/smart-notif/generated/kitchen.order_ready/table-1.mp3
public/audio/smart-notif/generated/kitchen.order_ready/table-2.mp3

public/audio/smart-notif/generated/waiter.order_ready/table-1.mp3
public/audio/smart-notif/generated/waiter.order_ready/table-2.mp3

public/audio/smart-notif/generated/kitchen.sla_warning/table-1.mp3
public/audio/smart-notif/generated/kitchen.sla_warning/table-2.mp3

public/audio/smart-notif/fallback/order-created.mp3
public/audio/smart-notif/fallback/kitchen-ready.mp3
public/audio/smart-notif/fallback/waiter-ready.mp3
public/audio/smart-notif/fallback/general-alert.mp3
```

> **Catatan:** Jika project deploy di Vercel/serverless, jangan tulis file runtime langsung ke folder `public`. Gunakan storage adapter seperti S3, R2, Supabase Storage, atau generate audio lokal lalu commit asset MP3 ke repo.

## 6. File yang Harus Dicari/Audit

* [ ] Cari route Smart Notifikasi yang sudah ada.
* [ ] Cari component Smart Notifikasi yang sudah ada.
* [ ] Cari service/helper notifikasi yang sudah ada.
* [ ] Cari schema database notification/settings/log yang sudah ada.
* [ ] Cari permission/role system yang sudah ada.
* [ ] Cari audit log helper yang sudah ada.
* [ ] Cari toast/audio player yang sudah ada.
* [ ] Cari POS order created trigger.
* [ ] Cari Kitchen KDS order ready trigger.
* [ ] Cari Waiter notification trigger.
* [ ] Cari Inventory low stock trigger.
* [ ] Cari Finance cash closing trigger.

Command pencarian:
```bash
grep -R "smart" -n src
grep -R "notif" -n src
grep -R "notification" -n src
grep -R "kitchen" -n src
grep -R "order_created" -n src
grep -R "tableNo" -n src
grep -R "audio" -n src
```

## 7. File yang Mungkin Diupdate

(Hanya update jika sudah ada, jangan buat duplikat):
```txt
src/lib/smart-notif-templates.ts
src/lib/smart-notif-service.ts
src/lib/smart-notif-voice-assets.ts
src/lib/elevenlabs-voice.ts
src/app/api/smart-notif/trigger/route.ts
src/app/api/smart-notif/voice/route.ts
src/app/api/smart-notif/settings/route.ts
src/components/garage/smart-notif-center.tsx
src/components/garage/garage-voice-player.tsx
scripts/generate-smart-notif-audio.ts
```

## 8. Helper Function yang Dibutuhkan

```ts
buildSmartNotifMessage(triggerKey, payload)
buildVoiceAssetKey(triggerKey, payload)
resolvePermanentVoiceUrl(triggerKey, payload)
resolveFallbackVoiceUrl(triggerKey)
shouldGenerateVoiceAsset(settings)
saveGeneratedVoiceAsset(assetKey, audioBuffer)
playGarageSmartVoice({ chimeUrl, audioUrl, fallbackUrl })
```

* [ ] Semua helper punya TypeScript type.
* [ ] Semua payload divalidasi Zod.
* [ ] Jangan crash jika payload tidak lengkap.
* [ ] Jangan expose API key ke client.
* [ ] Jangan import server-only code ke client component.

## 9. API Behavior

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
  "audioUrl": "/audio/smart-notif/generated/pos.order_created/table-7.mp3",
  "audioSource": "permanent",
  "chimeUrl": "/audio/smart-notif/chime/garage-station-chime.mp3"
}
```

* [ ] Endpoint private.
* [ ] Wajib auth.
* [ ] Wajib permission.
* [ ] Wajib Zod validation.
* [ ] Simpan notification log.
* [ ] Return audioUrl jika ada.
* [ ] Return fallback jika audio permanen belum ada.
* [ ] Jangan gagal total hanya karena ElevenLabs error.

## 10. Script Generate Audio Permanen

File: `scripts/generate-smart-notif-audio.ts`

* [ ] Generate audio meja 1 sampai 50.
* [ ] Generate untuk trigger:
  * `pos.order_created`
  * `kitchen.order_ready`
  * `waiter.order_ready`
  * `kitchen.sla_warning`
* [ ] Simpan sebagai MP3.
* [ ] Tidak overwrite file lama kecuali flag `--force`.
* [ ] Bisa dijalankan manual oleh developer.
* [ ] Aman jika env API key tidak ada.
* [ ] Menampilkan log sukses/gagal.
* [ ] Tidak pernah print API key ke terminal.

Command contoh:
```bash
pnpm tsx scripts/generate-smart-notif-audio.ts --tables=1-50
pnpm tsx scripts/generate-smart-notif-audio.ts --tables=1-50 --force
```

## 11. UI Update Smart Notifikasi

* [ ] Jangan tambah menu baru jika Smart Notifikasi sudah ada.
* [ ] Tambahkan section “Voice Asset Permanen”.
* [ ] Tambahkan status API ElevenLabs.
* [ ] Tambahkan status audio permanen.
* [ ] Tambahkan status fallback aktif.
* [ ] Tambahkan tombol “Preview Suara”.
* [ ] Tambahkan tombol “Generate Audio Meja 1-50”.
* [ ] Tambahkan tombol “Download Audio”.
* [ ] Tambahkan toggle “Gunakan Fallback Saat API Habis”.
* [ ] Tambahkan volume control.
* [ ] Tambahkan chime on/off.
* [ ] Tambahkan cooldown per trigger.
* [ ] UI harus responsive tablet POS/KDS.
* [ ] UI harus sesuai theme Garage OS, bukan SaaS generik.

## 12. Database Update Jika Dibutuhkan

(Jika sudah ada tabel settings/log, update saja. Jangan buat tabel duplikat.)

### voice settings
* `autoGenerateVoiceAsset boolean default false`
* `voiceStorageProvider string default "local"`
* `fallbackAudioUrl string nullable`
* `chimeAudioUrl string default "/audio/smart-notif/chime/garage-station-chime.mp3"`

### notification logs
* `tableNo string nullable`
* `orderNo string nullable`
* `audioUrl string nullable`
* `audioSource string nullable`
* `voiceGeneratedAt timestamp nullable`

* [ ] Migration aman.
* [ ] Tidak merusak data lama.
* [ ] Default value jelas.
* [ ] Build tidak butuh DB live saat import.

## 13. Permission & Security

* [ ] API key hanya di server.
* [ ] Tidak ada `NEXT_PUBLIC_ELEVENLABS_API_KEY`.
* [ ] `.env` tidak dicommit.
* [ ] User tanpa permission tidak bisa manage Smart Notifikasi.
* [ ] User operasional hanya bisa receive/play notifikasi sesuai role.
* [ ] Finance alert hanya untuk finance/owner.
* [ ] CEO risk alert hanya untuk owner/CEO.
* [ ] Semua update settings masuk audit log.
* [ ] Jika API key lama pernah bocor, beri catatan rotate API key.

## 14. Testing Checklist

### Order/POS
* [ ] Order meja 7 masuk, suara menyebut meja 7.
* [ ] Order tanpa meja tetap tidak error.
* [ ] Order tanpa order number tetap tidak error.
* [ ] POS tidak memanggil ElevenLabs jika audio permanen sudah ada.

### Kitchen
* [ ] Kitchen ready meja 3 menyebut meja 3.
* [ ] Kitchen SLA warning menyebut meja jika tersedia.
* [ ] Kitchen tablet tidak lambat saat audio diputar.

### Waiter
* [ ] Waiter menerima suara “Pesanan meja X siap diantar”.
* [ ] Waiter tidak menerima alert yang bukan role-nya.

### Fallback
* [ ] Jika API key kosong, sistem tetap pakai fallback.
* [ ] Jika ElevenLabs error, sistem tetap pakai fallback.
* [ ] Jika audio permanen tidak ada dan auto-generate off, sistem pakai fallback.
* [ ] Jika audio permanen ada, audioSource = permanent.

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

## 15. Acceptance Criteria

Fitur dianggap selesai jika:
* [ ] Smart Notifikasi tetap memakai modul existing.
* [ ] Tidak ada fitur/menu duplikat.
* [ ] Pesanan menyebut nomor meja saat tersedia.
* [ ] Audio permanen bisa digunakan tanpa ElevenLabs runtime.
* [ ] Fallback audio bekerja saat API habis/error.
* [ ] Script generate audio tersedia.
* [ ] UI settings voice asset tersedia.
* [ ] Permission, validation, audit log, dan fallback aman.
* [ ] Build dan lint berhasil.

## 16. Catatan Penting untuk Developer

* Jangan gunakan API key yang sudah pernah terlihat di chat.
* Rotate API key ElevenLabs sebelum production.
* Mode terbaik untuk operasional adalah permanent audio asset.
* Live generate hanya untuk admin/generate asset, bukan untuk setiap transaksi.
* Nomor order tetap penting di layar, tetapi suara operasional harus fokus ke nomor meja agar staff cepat bergerak.
