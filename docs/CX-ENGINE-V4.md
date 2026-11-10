# Garage Coffee — Customer Experience Engine V4 (Invoice Digital V4)

Owner brief: "Customer Experience Engine V4 — Animated Invoice · CRM Membership · Digital Member Card · Smart
Marketing · WhatsApp Order Tracking" (Nov 2026). Referensi visual: papan Invoice Digital V4 (desktop, tablet, mobile).

Prinsip: **satu invoice, satu pelanggan, satu pengalaman** — tanpa database pelanggan/loyalty kedua.
Invoice & tracking tetap jalan tanpa daftar member; daftar member tidak pernah jadi syarat bayar.

## 1. Hasil audit (sebelum perubahan)

| Area | Temuan | Tindakan |
|---|---|---|
| Invoice publik | Nomor WA pelanggan tampil **penuh** di `/invoice/[token]`. | Dimasking (`maskPhone`). |
| Invoice publik | Tidak ada `noindex` di halaman (hanya `robots.txt`). | `robots: noindex,nofollow` + `referrer: no-referrer`. |
| Invoice publik | "Animated Invoice V3" tidak ada di repo; halaman lama satu file 1.140 baris. | Dibangun ulang modular di `src/components/garage/invoice-v4/`. |
| Status bayar | Halaman lama punya logika "lunas" sendiri. | `invoicePaymentState` memakai `paymentStatusOf` (+ perilaku lama captured/issued). Non-tunai pending = "Menunggu Konfirmasi". |
| Benefit member | `memberLevelRules.perks` menyebut "Free monthly drink", "Birthday reward", "Exclusive event", "Prototype access" — **tidak ada mesinnya**. | Tidak ditampilkan ke pelanggan. Hanya `verifiedTierBenefits` (poin, bayar pakai poin, voucher member, welcome reward). |
| Aturan poin | Konstanta lama `POINT_EARN_AMOUNT`/`POINTS_PER_REDEEM_UNIT` ≠ aturan aktif di Pengaturan (`pointsPerThousand`, `memberPointValue`, `memberRedeemMaxPct`, `memberRedeemMinPoints`). Progres level di `memberResponseData` memakai ambang poin, padahal naik level memakai belanja 12 bulan. | Invoice memakai nilai Pengaturan + `tierProgressBySpend`. Konstanta lama **tidak diubah** (dipakai modul lain) — lihat Risiko. |
| Welcome voucher | Benar diterbitkan `issueWelcomeVoucher` (10%, maks Rp25.000, 30 hari, sekali pakai) tapi tidak dikembalikan API register. | Dikembalikan; UI menampilkan voucher dari data `vouchers` nyata (tersaring kuota/dipakai). Tes menjaga angka = kode. |
| Promo | Kolom `vouchers.status` tetap `active` setelah `ends_at` lewat (tidak ada sweeper); daftar Marketing menghitungnya "aktif". | `voucherEffectiveStatus` → `effectiveStatus` di API promo; Marketing menandai "Kedaluwarsa — tidak bisa dipakai". `validateVoucher` sudah menolak sejak dulu. |
| Consent | Tidak ada penyimpanan izin promosi WhatsApp. | Tabel append-only `customer_marketing_consents` (migration 0182). |
| Pendaftaran | `registerMember` menautkan ke `customers` lama berdasarkan **nomor telepon** (tanpa OTP) → poin/riwayat customer POS bisa diklaim orang yang tahu nomornya. | Perilaku lama **tidak diubah** (aturan bisnis existing). Dicatat sebagai risiko P1. Invoice V4 sendiri tidak pernah menautkan transaksi dari token. |
| WhatsApp | `whatsapp-link.ts` (wa.me gratis) + setting `garageWhatsapp`. | Dipakai; nomor = setting outlet, fallback nomor resmi. |

## 2. Arsitektur

```
/invoice/[token] (server)      getPublicInvoiceTracking + getInvoiceLiveStatus + getAppSettings
 ├─ InvoiceActions             Bagikan (Web Share / salin) · Simpan PDF / Cetak (print) · Hubungi Kasir
 ├─ InvoiceQrisCard            QRIS resmi (object-contain), Perbesar/Simpan, "Saya Sudah Bayar" = bantuan bukti
 ├─ InvoiceLiveTrackerV4       polling 8 dtk, 5 langkah, Bar/Dapur/Waiter|Kasir|Kurir, router.refresh saat status order berubah
 ├─ WhatsAppOrderShare         preview pesan, opsi sertakan nama, wa.me (teks saja)
 ├─ InvoiceMembership          GET /api/invoice/[token]/member-context (sesi member, BUKAN token)
 │   ├─ MembershipInvitation + MemberCardPreview (tanpa identitas/QR palsu)
 │   ├─ MemberRegisterSheet     /api/member/auth/register (+ marketingConsent, source=invoice)
 │   ├─ MemberCardPanel         PremiumMembershipCard asli, poin, progres belanja, consent
 │   ├─ SmartOfferCarousel      getEligibleCustomerOffers
 │   └─ MemberTierBenefits      tierShowcase (benefit terverifikasi)
 ├─ CinematicInvoiceHero       Three.js lazy, ≥1024px + pointer halus + ≥4 core, intro 2,1 dtk lalu statis
 └─ InvoiceMotion              GSAP ScrollTrigger reveal (tidak aktif saat reduced-motion) + event invoice_viewed
```

Logika murni (testable, aman di client): `src/lib/invoice-v4.ts`, `src/lib/customer-offers.ts`,
`src/lib/cx-whatsapp.ts`, `src/lib/cx-events.ts`. Server: `src/lib/customer-experience-service.ts`.

### API baru
| Route | Guard | Fungsi |
|---|---|---|
| `GET /api/invoice/[token]/member-context` | `requireMemberAuth` opsional + rate limit | guest: promo umum tanpa kode; member: kartu, poin, voucher milik sendiri |
| `POST /api/invoice/[token]/events` | rate limit, whitelist event | funnel tanpa PII, dedupe 30 menit |
| `GET/POST /api/member/consent` | `requireMemberAuth` | izin promosi WA (append-only) |
| `GET /api/crm/cx-funnel` | `crm:read` | funnel invoice → member untuk Owner |
| `GET/POST /api/crm/cx-campaigns` | `crm:read` / `crm:write` | kandidat kampanye A–E + catat "opened" |

### Data (migration `0182_cx_engine_v4`)
- `customer_marketing_consents`: izin aktif = baris terbaru per customer/channel; opt-out = baris baru.
- `customer_experience_events`: `event`, `order_id`, `customer_id`, `created_at`. Tanpa nomor WA, PIN, token, IP, isi pesan.

## 3. Keamanan & privasi
- Token invoice ≠ kepemilikan akun. Konteks member hanya dari cookie sesi member. Invoice **tidak** ditautkan ke
  akun dari halaman publik; penautan tetap lewat kasir (scan QR member). UI berkata jujur bila belum tertaut.
- Voucher pribadi orang lain tidak pernah dikirim ke klien; guest tidak menerima kode voucher.
- Tidak ada "Lunas" dari klien. "Saya Sudah Bayar" hanya membuka WA dengan teks + instruksi lampirkan bukti.
- wa.me: klik dicatat "dibuka", tidak ada status terkirim/dibaca. Tidak ada scraping WA Web.
- Promosi WA hanya untuk member dengan consent aktif + maks. 1×/7 hari; pesan promo memuat "Balas STOP".
- Rate limit: register (8/menit, existing), member-context 40/menit, events 60/menit, consent 20/menit.

## 4. Kampanye WhatsApp (manual, gratis)
CRM → Dashboard CRM → "Kampanye WhatsApp (manual)": A Welcome (layanan, ≤7 hari setelah daftar),
B Progres level (≤20% ke level berikutnya), C Pengingat voucher pribadi (≤3 hari), D Ajak kembali (>30 hari tanpa
transaksi lunas, sertakan promo member nyata bila ada), E Ulang tahun (ucapan; hadiah HANYA bila ada voucher
`BDAY-`/`BIRTHDAY-` milik member). Staf menekan Kirim sendiri; tidak ada otomasi berbayar.

## 5. Animasi
- Three.js vanilla (sudah dependensi; **React Three Fiber tidak ditambahkan** — mengikuti pola AYA 3D, tanpa
  dependensi baru). Hanya intro, lalu tidak ada loop GPU.
- GSAP + ScrollTrigger: reveal bertahap; tanpa JS / reduced-motion konten tampil normal.
- framer-motion: stepper, kartu member (reveal perspektif), sukses pendaftaran, tombol WA.
- CSS: shimmer skeleton, titik live, kilau kartu pratinjau (2× lalu berhenti).
- QRIS & QR member tidak pernah ditransformasi.

## 6. Pengujian
- Unit: `invoice-v4.test.ts`, `customer-offers.test.ts`, `cx-whatsapp.test.ts`.
- Integrasi PGlite: `customer-experience.integration.test.ts` (guest tanpa kode, register + welcome voucher nyata,
  consent append-only, invoice tidak tertaut, dedupe event, kampanye diblokir tanpa izin).
- `api-route-auth.test.ts` (semua route baru ber-guard).
- QA visual Playwright 1366×900, 390×844, 360×800: tanpa overflow horizontal, tanpa console error; alur daftar →
  kartu → voucher → WA diuji di browser.

## 7. Risiko & rekomendasi sebelum deploy
1. **P1 — klaim akun via nomor telepon** (`registerMember` existing): perlu verifikasi WA (OTP/kasir) sebelum
   menggabungkan poin customer POS lama. Butuh keputusan Owner (provider OTP = integrasi baru).
2. ~~Progres level `/member` memakai ambang poin lama~~ — **selesai**: `/member` memakai `tierProgressBySpend`
   ("Belanja Rp… lagi"), kartu level menampilkan syarat belanja. `memberResponseData.progress` (berbasis poin) masih
   dikirim API untuk kompatibilitas tapi tidak lagi ditampilkan.
3. Perk tier yang belum punya mesin (birthday reward, free monthly drink, event) — Owner putuskan: implementasi atau
   hapus dari `memberLevelRules`.
4. ~~Tidak ada sweeper status voucher~~ — **selesai**: `expireEndedVouchers` tiap jam (menit 23, `instrumentation-node.ts`)
   mengubah voucher `active` yang `ends_at` lewat → `expired`. Kuota habis tidak diubah.
5. Deploy: migration 0182 (CREATE TABLE saja, aman), jalankan `release-check.sh`, uji di staging dulu.

### Rollback
Revert commit halaman/komponen; tabel 0182 aman dibiarkan (tidak dibaca kode lama). Bila perlu dibuang:
`DROP TABLE customer_experience_events; DROP TABLE customer_marketing_consents;` (setelah backup).
