# Garage Coffee & Motor OS — Go-Live Checklist

Panduan ringkas agar aplikasi siap operasional (production). Centang berurutan.
Status saat dokumen ini dibuat: build lolos (152 halaman), lint 0 error, semua
endpoint inti 9 modul merespons 200 pada DB lokal (PGlite).

---

## 1. Database produksi (BLOCKER)

Saat dev, app memakai **PGlite lokal** (`./.garage-db`) yang **tidak persist** ke
server dan tidak punya backup. Untuk operasional WAJIB pakai Postgres sungguhan.

- [ ] Provision Postgres produksi (Neon/Supabase/RDS/VPS). Catatan: Neon yang lama
      sempat **quota exceeded** — pastikan plannya cukup.
- [ ] Set env `DATABASE_URL` ke koneksi produksi.
- [ ] Set `GARAGE_DB_DRIVER="postgres"` (memaksa cloud Postgres, bukan PGlite).
- [ ] Set `DATABASE_SSL="true"` untuk managed Postgres (false hanya untuk lokal).
- [ ] Jalankan migrasi & seed di DB produksi:
      ```bash
      npm run db:migrate
      npm run db:seed
      ```

## 2. Kredensial & secret (BLOCKER)

Nilai dev di `.env.local`/`.env.example` adalah **placeholder** — jangan dipakai live.

- [ ] `BETTER_AUTH_SECRET` — string acak ≥ 32 char (auth staff).
- [ ] `MEMBER_AUTH_SECRET` — string acak ≥ 32 char (auth member).
- [ ] `AI_CONFIG_ENCRYPTION_KEY` — 32-byte base64 / secret panjang.
- [ ] `GARAGE_JOB_SECRET` & `CRON_SECRET` — secret panjang untuk cron/job.
- [ ] `GARAGE_POS_API_KEY` — ganti dari nilai dev.
- [ ] `GARAGE_SEED_PASSWORD` / `GARAGE_MEMBER_SEED_PASSWORD` — ganti dari
      `garage12345`/`member12345`. Setelah seed, **minta tiap staff ganti password
      sendiri** dan jangan simpan password demo.
- [ ] `BETTER_AUTH_URL`, `GARAGE_PUBLIC_BASE_URL`,
      `NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL` — set ke domain/URL produksi asli.
- [ ] `GARAGE_TRUSTED_ORIGINS` — daftar origin produksi (hindari localhost di live).

> Generate secret cepat: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## 3. Data nyata vs seed

- [ ] Menu & harga (termasuk varian: Coffee Cold/Hot, Nasi Goreng Sedang/Pedas,
      Ayam Richeese Barbeque/Balado/Campur) sudah sesuai data Garage sebenarnya.
- [ ] Stok inventory (sku, on-hand, min, status) sudah data riil, bukan mock.
- [ ] Outlet, pajak/PB1, dan service charge di Pengaturan sudah benar.

## 4. Deploy

- [ ] Tentukan host (Vercel / VPS / Docker). Build sudah lolos: `npm run build`.
- [ ] Pasang seluruh env produksi di host.
- [ ] `NODE_ENV=production`.
- [ ] Pastikan `.env.local`, `.garage-db/`, `.next/` TIDAK ikut ter-deploy sebagai
      sumber data (sudah di-ignore di `.gitignore`).

## 5. Verifikasi operasional (manual, di perangkat asli)

Login `owner@garage.local` (atau akun produksi), cek tiap modul tanpa error:

- [ ] **POS** — alur kasir, varian harga, cart (item+varian+qty), total benar.
- [ ] **Kitchen** — antrian & status order.
- [ ] **Inventory** — tabel stok, status low/watch/safe, search.
- [ ] **Finance** — cash session, expense, overview.
- [ ] **CRM** — customer, segmen, loyalty.
- [ ] **Approvals** — alur persetujuan diskon/expense.
- [ ] **Audit** — log & dashboard.
- [ ] **Pengaturan** — scope Outlet & Global, search, sticky save bar, badge dirty.
- [ ] Cek responsif: desktop ~1366×900 dan mobile/tablet ~390×844.
- [ ] Tidak ada error di console browser.
- [ ] Tes printer struk thermal bila dipakai.

## 6. Operasional berkelanjutan

- [ ] Strategi **backup** DB produksi terjadwal.
- [ ] Uji alur **reset password** & **2FA** staff.
- [ ] (Opsional) Integrasi yang diisi hanya bila dipakai: WhatsApp Cloud, OpenAI/AI
      providers, Google Drive reports, ElevenLabs TTS. Semua aman dibiarkan kosong
      bila belum dibutuhkan (fitur AI/voice akan non-aktif, app tetap jalan).

---

### Ringkasan env WAJIB (minimum untuk jalan)

```
DATABASE_URL=...
GARAGE_DB_DRIVER=postgres
DATABASE_SSL=true
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://domain-produksi
MEMBER_AUTH_SECRET=...
AI_CONFIG_ENCRYPTION_KEY=...
GARAGE_JOB_SECRET=...
CRON_SECRET=...
GARAGE_POS_API_KEY=...
GARAGE_PUBLIC_BASE_URL=https://domain-produksi
NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL=https://domain-produksi
GARAGE_TRUSTED_ORIGINS=https://domain-produksi
```

Sisanya (WhatsApp, OpenAI, Google, ElevenLabs, SSH) bersifat **opsional** —
isi hanya bila integrasinya benar-benar dipakai.
