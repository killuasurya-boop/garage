# GARAGE OS Content Publisher

GARAGE OS menjadi sumber utama untuk content approval dan publikasi akun resmi
`G A R A G E`. Airtable tetap dapat dipakai sebagai editorial workspace, tetapi
status final dan OAuth platform dimiliki GARAGE OS.

Runbook aktivasi live ada di `docs/GARAGE_OS_SOCIAL_ACTIVATION_RUNBOOK.md`.

## URL Publik

- App: `https://app.garagecoffee.id`
- TikTok callback:
  `https://app.garagecoffee.id/api/integrations/tiktok/callback`
- Privacy Policy: `https://app.garagecoffee.id/legal/privacy`
- Terms of Service: `https://app.garagecoffee.id/legal/terms`

## Integration Control Center

Owner membuka `Pengaturan > Integrasi`. GARAGE OS menyimpan token OAuth
terenkripsi dan menampilkan resource terpisah untuk Facebook Page, Instagram
Business, WhatsApp phone number, TikTok creator, YouTube channel, dan Google
Business Profile. Threads tetap `review_required` sampai akun resmi tersedia.
Jika satu akun Meta mengelola beberapa Page, semuanya ditampilkan sebagai
candidate dan Owner wajib memilih Page tujuan beserta Instagram Business yang
tertaut sebelum status berubah menjadi `connected`.

Callback:

- Meta: `/api/integrations/meta/callback`
- TikTok: `/api/integrations/tiktok/callback`
- YouTube: `/api/integrations/youtube/callback`
- Google Business Profile: `/api/integrations/google_business/callback`
- Threads: `/api/integrations/threads/callback`

Webhook:

- Meta: `/api/webhooks/meta`
- WhatsApp: `/api/webhooks/whatsapp`

## TikTok Developer

Konfigurasi app `G A R A G E Content Publisher`:

1. Web/Desktop URL: `https://app.garagecoffee.id`
2. Redirect URI:
   `https://app.garagecoffee.id/api/integrations/tiktok/callback`
3. Products: Login Kit dan Content Posting API.
4. Scopes: `user.info.basic`, `video.upload`, `video.publish`.
5. Privacy selama app belum diaudit: `SELF_ONLY`.

## Approval Gate

Status utama:

`draft -> ai_ready -> needs_approval -> approved -> scheduled -> publishing -> published`

`revision`, `rejected`, `partial`, dan `failed` menangani jalur non-happy-path.
Endpoint publish menolak record yang belum pernah masuk status `approved`.

## Endpoint

- `GET /api/integrations/tiktok/start`
- `GET /api/integrations/tiktok/callback`
- `GET /api/integrations/tiktok/status`
- `GET /api/integrations`
- `GET /api/integrations/readiness`
- `POST /api/integrations/:provider/test`
- `POST /api/integrations/:provider/disconnect`
- `GET /api/integrations/:provider/start`
- `GET /api/integrations/:provider/callback`
- `GET|POST /api/marketing/publishing`
- `PATCH /api/marketing/publishing/:id/status`
- `POST /api/marketing/publishing/:id/publish`
- `POST /api/jobs/social-publishing`
- `POST /api/jobs/social-analytics`
- `POST /api/messaging/whatsapp`
- `POST /api/jobs/whatsapp-messaging`

OAuth start/callback hanya dapat dipakai Owner/CEO. Queue memakai permission
`marketing:read` dan `marketing:write`.

## Rollout

TikTok memakai `SELF_ONLY`, YouTube memakai `private`, dan scheduler live baru
diaktifkan setelah health check resource tujuan berstatus hijau. Google Business
Profile tidak memiliki sandbox; gunakan akun/lokasi resmi dan validasi manual
sebelum mengaktifkan local post.

Sebelum mengaktifkan live scheduler, Owner wajib membuka `Pengaturan >
Integrasi` dan memastikan panel publishing readiness berstatus `ready`. Endpoint
`GET /api/integrations/readiness` juga tersedia untuk preflight server-side.
Worker akan tetap memblokir publish jika provider tujuan belum siap meskipun
`SOCIAL_PUBLISHING_LIVE_ENABLED=true`.

Feature flag production:

- `SOCIAL_PUBLISHING_LIVE_ENABLED=false`
- `WHATSAPP_MESSAGING_LIVE_ENABLED=false`

Ubah satu per satu menjadi `true` hanya setelah account identity dan health
check provider terkait sudah diverifikasi. Instagram menerima image, Reels,
dan carousel hingga 10 asset melalui `assetUrl` + `assetUrls`.

Migrasi token YouTube lama:

1. Isi `LEGACY_YOUTUBE_REFRESH_TOKEN`, OAuth client Google, dan
   `YOUTUBE_CHANNEL_ID`.
2. Jalankan `npm run social:migrate-youtube`.
3. Test koneksi dari Control Center.
4. Cabut token/app worker lama setelah koneksi baru terverifikasi.
