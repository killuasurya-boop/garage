# GARAGE OS Social Activation Runbook

Runbook ini dipakai Owner sebelum mengaktifkan auto-publish GARAGE OS.
Prinsip utama: koneksi boleh disiapkan lebih dulu, tetapi live scheduler tidak
diaktifkan sebelum readiness hijau dan checklist manual selesai.

## Gate Utama

1. Buka `Pengaturan > Integrasi`.
2. Pastikan `Activation Runbook` tidak memiliki blocker.
3. Pastikan panel publishing readiness berstatus `ready`.
4. Jalankan test masing-masing provider dari Control Center.
5. Aktifkan live satu platform per tahap, bukan semua sekaligus.

## Urutan Aktivasi

1. **Meta**
   - Hubungkan Meta OAuth.
   - Pilih Facebook Page GARAGE yang benar.
   - Pastikan Instagram Business `garage_tbt.id` tertaut.
   - Jalankan health check Facebook dan Instagram.

2. **YouTube**
   - Hubungkan Google OAuth.
   - Pastikan channel identity sesuai `YOUTUBE_CHANNEL_ID`.
   - Upload Shorts pertama dengan `YOUTUBE_PRIVACY_STATUS=private`.

3. **TikTok**
   - Hubungkan TikTok OAuth.
   - Tetap gunakan `TIKTOK_POST_PRIVACY_LEVEL=SELF_ONLY` sampai app review selesai.
   - Pastikan upload test masuk ke akun GARAGE yang benar.

4. **WhatsApp**
   - Validasi `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.
   - Test template resmi ke nomor internal.
   - Jangan aktifkan broadcast pelanggan sebelum delivery webhook terbaca.

5. **Google Maps dan Google Business Profile**
   - Jalankan test Maps/Places untuk `GARAGE_GOOGLE_PLACE_ID`.
   - Validasi Google Business Profile.
   - Untuk GBP, lakukan perubahan profil hanya setelah manual review karena tidak ada sandbox.

## Feature Flag

Default production:

```env
SOCIAL_PUBLISHING_LIVE_ENABLED=false
WHATSAPP_MESSAGING_LIVE_ENABLED=false
```

Naikkan flag hanya setelah:

- `GET /api/integrations/readiness` tidak menunjukkan blocker.
- Control Center menampilkan provider tujuan ready.
- Owner menyelesaikan checklist manual di `Activation Runbook`.
- Konten pertama sudah melewati approval Owner.

## Rollback

Jika ada publish gagal atau akun tujuan salah:

1. Turunkan `SOCIAL_PUBLISHING_LIVE_ENABLED=false`.
2. Putuskan koneksi provider bermasalah dari Control Center.
3. Cabut token dari developer console/provider jika perlu.
4. Cek `content_publishing_results` untuk provider ID dan error.
5. Reconnect dan ulang health check sebelum retry.
