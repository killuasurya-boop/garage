# Crystal V5 — 02 Login member dengan Google

Tombol **Lanjutkan dengan Google** muncul di `/member-login` hanya bila server punya Client ID Google.
Login HP/email + PIN tetap ada.

## Alur
1. `GET /api/member/auth/google/start?next=/member`: membuat state, nonce, dan PKCE (S256), lalu redirect ke Google.
   - Disimpan di cookie HttpOnly bertanda tangan, berlaku 10 menit.
   - Scope yang diminta hanya `openid email profile`.
2. Google mengarahkan kembali ke `GET /api/member/auth/google/callback`.
   - State dicocokkan dengan cookie, lalu kode ditukar bersama `code_verifier`.
   - ID token diverifikasi di server: tanda tangan RS256 dicek dengan JWKS Google, juga `iss`, `aud`, `exp`, `nonce`, dan `email_verified`.
3. Pencocokan akun:
   - Pertama lewat `google_sub`.
   - Bila belum ada, lewat email yang sudah diverifikasi Google. Akun HP/PIN lama dengan email yang sama ditautkan, bukan dibuat ganda.
   - Email yang sudah tertaut ke akun Google lain ditolak.
4. Akun baru masuk ke form **Lengkapi Profil** (`/member-login?mode=google-complete`):
   - Nama: wajib.
   - WhatsApp: wajib, karena kasir mencari kartu member lewat nomor HP.
   - S&K: wajib.
   - Info promo WhatsApp: opsional dan default tidak dicentang.
5. `POST /api/member/auth/google/complete`:
   - Email diambil dari cookie bertanda tangan, bukan dari isian form.
   - Mencatat `terms_accepted_at` dan `marketing_consent_at` (null bila tidak setuju).
   - Setelah itu sesi member dibuat dan pengguna diarahkan ke `next`.

Kolom baru (migrasi **0183**) di `member_accounts`: `google_sub` (unik), `email_verified_at`, `avatar_url`,
`terms_accepted_at`, `marketing_consent_at`.

## Langkah Owner (sekali)
1. Buka Google Cloud Console → APIs & Services → **OAuth consent screen**.
   - User type: External.
   - Nama aplikasi: Garage Coffee.
   - Scope yang dipilih: email, profile, openid.
2. Buka **Credentials** → Create credentials → **OAuth client ID** → pilih Web application.
   - Authorized redirect URI: `https://garagecoffee.id/api/member/auth/google/callback`
   - Untuk staging, tambahkan juga: `https://staging.garagecoffee.id/api/member/auth/google/callback`
3. Isi variabel berikut di `.env` VPS (jangan di repo, jangan di chat):
   ```
   MEMBER_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   MEMBER_GOOGLE_CLIENT_SECRET=...
   ```
   Base URL diambil dari `MEMBER_PUBLIC_BASE_URL`. Bila kosong, dipakai `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL` atau `BETTER_AUTH_URL`.
4. Restart app. `GET /api/member/auth/providers` harus mengembalikan `{ google: true }`.

Tanpa langkah ini tombol Google tidak tampil, sehingga tidak ada tombol palsu.

## Catatan
- Member yang mendaftar lewat Google belum punya PIN yang diketahui. Mereka tetap bisa masuk lewat Google.
- Penukaran poin tetap dilakukan di kasir. Katalog reward belum ada dan tidak dipalsukan.
