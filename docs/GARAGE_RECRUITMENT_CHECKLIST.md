# GARAGE Recruitment Checklist

Dokumen ini menjadi checklist implementasi fitur Garage Recruitment untuk public applicant flow dan admin recruitment panel Garage OS.

## Public Recruitment

- [x] Navbar Recruitment
- [x] Halaman `/recruitment`
- [x] Form multi-step
- [x] Step 1: Pilih posisi
- [x] Step 2: Data diri
- [x] Step 3: Skill & pengalaman
- [x] Step 4: Social media
- [x] Step 5: Upload berkas
- [x] Step 6: Review & submit
- [x] Upload CV wajib
- [x] Upload pas foto wajib dengan preview
- [x] Upload KTP opsional
- [x] Upload sertifikat/portfolio opsional
- [x] Drag & drop upload
- [x] Tombol hapus/ganti file
- [x] Validasi format file frontend
- [x] Validasi ukuran file frontend
- [x] Validasi format file backend
- [x] Validasi ukuran file backend
- [x] Progress bar upload
- [x] Error message upload yang jelas
- [x] Review sebelum submit
- [x] Checkbox persetujuan data
- [x] Success message setelah submit
- [x] Follow-up grup WhatsApp setelah submit
- [x] Auto-save draft form di browser
- [x] Mobile responsive

## Admin Recruitment

- [x] Admin dapat melihat daftar kandidat
- [x] Admin dapat melihat detail kandidat
- [x] Admin dapat filter kandidat berdasarkan posisi
- [x] Admin dapat filter kandidat berdasarkan status
- [x] Admin dapat search nama / WhatsApp / email
- [x] Admin dapat update status kandidat
- [x] Status pipeline: Baru, Diproses, Interview, Diterima, Ditolak
- [x] Admin dapat menulis catatan internal
- [x] Admin dapat memberi score kandidat
- [x] Admin dapat follow up via WhatsApp
- [x] Admin dapat melihat CV
- [x] Admin dapat melihat pas foto
- [x] Admin dapat melihat portfolio/sertifikat
- [x] KTP hanya tampil di panel internal

## Security & Privacy

- [x] Proteksi akses admin kandidat melalui `requireGarageSession`
- [x] File kandidat disimpan di `storage/recruitment`, bukan folder public
- [x] File kandidat dibaca melalui route protected `/api/recruitment/files/[file]`
- [x] File kandidat hanya dapat dibuka oleh Owner / CEO, Admin, dan Manager Operasional
- [x] Nama file disanitasi dengan UUID pendek
- [x] Route file memakai `X-Content-Type-Options: nosniff`
- [x] Data KTP tidak tampil di halaman publik
- [ ] Tambahkan role khusus HR jika role tersebut resmi dibuat di sistem user Garage OS

## Verification

- [x] Typecheck selesai (`npx.cmd tsc --noEmit`)
- [x] Lint selesai (`npx.cmd eslint ...recruitment files`, 0 error; 1 existing warning di debounce admin view)
- [x] Build selesai (`npm.cmd run build`)
- [x] Runtime smoke `/recruitment` selesai (`curl.exe -i http://localhost:3001/recruitment` -> 200 OK)
- [x] Browser QA desktop `/recruitment`
- [x] Browser QA mobile `/recruitment`
- [ ] Browser QA admin Recruitment
- [x] Test upload valid dan invalid
- [x] Test submit lamaran
- [x] Test admin list kandidat authenticated
- [x] Test admin update status Interview + score + catatan + jadwal
- [x] Test public tracking status setelah update admin
- [x] Test recruitment analytics authenticated
- [x] Test akses file tanpa login ditolak

## Runtime Note

Pada QA lokal 2026-06-22, public page `/recruitment` sudah 200 OK memakai fallback posisi saat DB belum siap. `/api/health` masih mengembalikan `DATABASE_UNREACHABLE` dari PGlite lokal (`Aborted(). Build with -sASSERTIONS for more info.`), sehingga submit lamaran, admin recruitment, dan akses file protected belum bisa diuji end-to-end sampai runtime DB pulih.

Update 2026-06-23: `/recruitment` sempat menggantung saat load posisi menunggu PGlite gagal boot. Route public sekarang memakai timeout fallback posisi hardcoded, dan smoke `curl.exe -i http://127.0.0.1:3001/recruitment` kembali `200 OK`. Runtime DB juga dipulihkan untuk development dengan fallback PGlite ke `.pglite-data` saat `PGLITE_DATA_DIR` aktif abort. Evidence terbaru: `/api/health` `200 OK`, `POST /api/recruitment/apply` `201`, `GET /api/recruitment/candidates` authenticated `200`, `PATCH /api/recruitment/candidates/[id]` status `Interview` `200`, `POST /api/recruitment/track-status` `200`, `POST /api/recruitment/upload` valid `201` dan invalid `400 FILE_UNSUPPORTED`, `GET /api/recruitment/files/[file]` tanpa login `401`, `GET /api/recruitment/analytics` authenticated `200`, dan `npm.cmd run build` selesai sukses. Browser QA public desktop/mobile memakai Chrome headless screenshot di `.codex-screenshots/recruitment-desktop-final2.png` dan `.codex-screenshots/recruitment-mobile-final5.png`; mobile clipping pada hero/header sudah diperbaiki. Browser QA visual admin Recruitment belum diklaim.
