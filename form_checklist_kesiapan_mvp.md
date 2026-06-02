# Form Checklist Kesiapan MVP Aplikasi

Gunakan form ini untuk mengecek apakah aplikasi MVP sudah layak masuk tahap testing, staging, atau production.

> Cara pakai:
> - Isi kolom status dengan: `Belum`, `Proses`, `Selesai`, atau `N/A`.
> - Isi PIC dengan nama penanggung jawab.
> - Isi catatan jika ada kendala, keputusan, atau risiko.
> - Checklist ini cocok untuk aplikasi mobile, web app, SaaS, marketplace, dan super app tahap MVP.

---

## Informasi Project

| Item | Isi |
|---|---|
| Nama aplikasi |  |
| Versi MVP |  |
| Tanggal review |  |
| Target launch |  |
| Product owner |  |
| Tech lead |  |
| Backend lead |  |
| Frontend/mobile lead |  |
| QA |  |
| DevOps |  |
| Domain production |  |
| URL staging |  |
| Repository |  |
| Catatan umum |  |

---

## Status Kesiapan Global

| Area | Status | PIC | Catatan |
|---|---|---|---|
| Product readiness |  |  |  |
| UI/UX readiness |  |  |  |
| Backend/API readiness |  |  |  |
| Database readiness |  |  |  |
| Admin panel readiness |  |  |  |
| Security readiness |  |  |  |
| Payment readiness |  |  |  |
| Deployment readiness |  |  |  |
| Monitoring readiness |  |  |  |
| Legal readiness |  |  |  |
| Support readiness |  |  |  |
| Launch readiness |  |  |  |

---

# 1. Product Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Problem statement sudah jelas | Wajib |  |  |  |
| 2 | Target user/persona sudah ditentukan | Wajib |  |  |  |
| 3 | Core value aplikasi sudah jelas | Wajib |  |  |  |
| 4 | Fitur MVP sudah dibatasi | Wajib |  |  |  |
| 5 | Fitur yang ditunda sudah dicatat | Wajib |  |  |  |
| 6 | User journey utama sudah dibuat | Wajib |  |  |  |
| 7 | Flow onboarding user sudah jelas | Wajib |  |  |  |
| 8 | Success metric MVP sudah ditentukan | Wajib |  |  |  |
| 9 | Roadmap versi berikutnya tersedia | Opsional |  |  |  |
| 10 | Risiko product sudah dicatat | Wajib |  |  |  |

---

# 2. UI/UX Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Desain halaman utama selesai | Wajib |  |  |  |
| 2 | Desain login/register selesai | Wajib |  |  |  |
| 3 | Desain profile/settings selesai | Wajib |  |  |  |
| 4 | Desain flow fitur utama selesai | Wajib |  |  |  |
| 5 | Desain empty state tersedia | Wajib |  |  |  |
| 6 | Desain error state tersedia | Wajib |  |  |  |
| 7 | Desain loading state tersedia | Wajib |  |  |  |
| 8 | Responsive untuk mobile/tablet/desktop dicek | Wajib |  |  |  |
| 9 | Warna, font, dan komponen konsisten | Wajib |  |  |  |
| 10 | UX testing ringan sudah dilakukan | Disarankan |  |  |  |

---

# 3. Authentication & User Management

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Register user berjalan | Wajib |  |  |  |
| 2 | Login user berjalan | Wajib |  |  |  |
| 3 | Logout berjalan | Wajib |  |  |  |
| 4 | Reset password tersedia | Wajib |  |  |  |
| 5 | Verifikasi email/OTP tersedia jika dibutuhkan | Disarankan |  |  |  |
| 6 | Profile user bisa dilihat | Wajib |  |  |  |
| 7 | Profile user bisa diubah | Wajib |  |  |  |
| 8 | Role user sudah jelas | Wajib |  |  |  |
| 9 | Hak akses tiap role sudah diterapkan | Wajib |  |  |  |
| 10 | Session/token expiry sudah diatur | Wajib |  |  |  |

---

# 4. Backend & API Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Struktur backend rapi dan modular | Wajib |  |  |  |
| 2 | API utama sudah selesai | Wajib |  |  |  |
| 3 | API auth sudah selesai | Wajib |  |  |  |
| 4 | API profile/user sudah selesai | Wajib |  |  |  |
| 5 | API fitur utama MVP sudah selesai | Wajib |  |  |  |
| 6 | API admin sudah tersedia | Wajib |  |  |  |
| 7 | API menggunakan versioning, contoh `/api/v1` | Disarankan |  |  |  |
| 8 | Validasi input diterapkan | Wajib |  |  |  |
| 9 | Error response konsisten | Wajib |  |  |  |
| 10 | API docs tersedia | Wajib |  |  |  |
| 11 | Swagger/OpenAPI tersedia | Disarankan |  |  |  |
| 12 | Rate limit API tersedia | Wajib |  |  |  |
| 13 | Pagination tersedia untuk list data | Wajib |  |  |  |
| 14 | Search/filter/sort tersedia jika dibutuhkan | Disarankan |  |  |  |

---

# 5. Database Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Schema database sudah final untuk MVP | Wajib |  |  |  |
| 2 | Migration tersedia | Wajib |  |  |  |
| 3 | Seeder data awal tersedia jika dibutuhkan | Disarankan |  |  |  |
| 4 | Index untuk query penting sudah dibuat | Wajib |  |  |  |
| 5 | Relasi data sudah benar | Wajib |  |  |  |
| 6 | Constraint data diterapkan | Wajib |  |  |  |
| 7 | Data sensitif tidak disimpan sembarangan | Wajib |  |  |  |
| 8 | Backup database tersedia | Wajib |  |  |  |
| 9 | Restore database sudah dites | Wajib |  |  |  |
| 10 | Database production tidak expose publik | Wajib |  |  |  |

---

# 6. Admin Panel Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Admin login tersedia | Wajib |  |  |  |
| 2 | Role admin tersedia | Wajib |  |  |  |
| 3 | Dashboard ringkas tersedia | Wajib |  |  |  |
| 4 | Manajemen user tersedia | Wajib |  |  |  |
| 5 | Manajemen data utama aplikasi tersedia | Wajib |  |  |  |
| 6 | Manajemen transaksi/order tersedia jika ada transaksi | Wajib |  |  |  |
| 7 | Export data tersedia jika dibutuhkan | Disarankan |  |  |  |
| 8 | Audit log admin tersedia | Wajib |  |  |  |
| 9 | Admin action berisiko butuh konfirmasi | Wajib |  |  |  |
| 10 | Admin panel tidak bisa diakses user biasa | Wajib |  |  |  |

---

# 7. Payment & Transaction Readiness

Lewati bagian ini jika aplikasi tidak memiliki transaksi.

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Payment gateway sudah dipilih | Wajib |  |  |  |
| 2 | Mode sandbox sudah dites | Wajib |  |  |  |
| 3 | Mode production sudah disiapkan | Wajib |  |  |  |
| 4 | Order lifecycle sudah jelas | Wajib |  |  |  |
| 5 | Status pembayaran konsisten | Wajib |  |  |  |
| 6 | Webhook payment gateway berjalan | Wajib |  |  |  |
| 7 | Webhook signature diverifikasi | Wajib |  |  |  |
| 8 | Idempotency diterapkan agar transaksi tidak dobel | Wajib |  |  |  |
| 9 | Invoice/receipt tersedia | Disarankan |  |  |  |
| 10 | Refund/cancel flow jelas | Wajib |  |  |  |
| 11 | Reconciliation payment disiapkan | Wajib |  |  |  |
| 12 | Riwayat transaksi user tersedia | Wajib |  |  |  |

---

# 8. Security Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Password di-hash dengan aman | Wajib |  |  |  |
| 2 | JWT/session secret kuat | Wajib |  |  |  |
| 3 | Refresh token strategy aman | Wajib |  |  |  |
| 4 | CORS dibatasi | Wajib |  |  |  |
| 5 | Rate limiting aktif | Wajib |  |  |  |
| 6 | Input validation aktif | Wajib |  |  |  |
| 7 | File upload divalidasi | Wajib |  |  |  |
| 8 | Data sensitif tidak muncul di log | Wajib |  |  |  |
| 9 | `.env` tidak masuk repository | Wajib |  |  |  |
| 10 | Security headers aktif | Disarankan |  |  |  |
| 11 | Admin route dilindungi RBAC | Wajib |  |  |  |
| 12 | Brute force protection tersedia | Disarankan |  |  |  |
| 13 | Audit log untuk aksi penting tersedia | Wajib |  |  |  |
| 14 | Dependency vulnerability dicek | Disarankan |  |  |  |

---

# 9. DevOps & Deployment Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | VPS sudah disiapkan | Wajib |  |  |  |
| 2 | User deploy dibuat | Wajib |  |  |  |
| 3 | SSH key digunakan | Wajib |  |  |  |
| 4 | Firewall aktif | Wajib |  |  |  |
| 5 | Docker terinstall | Wajib |  |  |  |
| 6 | Docker Compose tersedia | Wajib |  |  |  |
| 7 | File Dockerfile tersedia | Wajib |  |  |  |
| 8 | File docker-compose tersedia | Wajib |  |  |  |
| 9 | `.env.production` sudah disiapkan | Wajib |  |  |  |
| 10 | Domain sudah diarahkan ke VPS | Wajib |  |  |  |
| 11 | Nginx/Caddy reverse proxy aktif | Wajib |  |  |  |
| 12 | SSL/HTTPS aktif | Wajib |  |  |  |
| 13 | CI/CD tersedia | Disarankan |  |  |  |
| 14 | Script deploy tersedia | Wajib |  |  |  |
| 15 | Script rollback tersedia | Wajib |  |  |  |
| 16 | Staging environment tersedia | Wajib |  |  |  |
| 17 | Production environment tersedia | Wajib |  |  |  |

---

# 10. Testing & QA Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Unit test untuk logic penting tersedia | Disarankan |  |  |  |
| 2 | Integration test API utama tersedia | Disarankan |  |  |  |
| 3 | Manual QA checklist selesai | Wajib |  |  |  |
| 4 | Login/register sudah dites | Wajib |  |  |  |
| 5 | Fitur utama sudah dites | Wajib |  |  |  |
| 6 | Admin panel sudah dites | Wajib |  |  |  |
| 7 | Error case sudah dites | Wajib |  |  |  |
| 8 | Empty state sudah dites | Disarankan |  |  |  |
| 9 | Mobile responsive sudah dites | Wajib |  |  |  |
| 10 | Cross-browser test dilakukan | Disarankan |  |  |  |
| 11 | Payment sandbox sudah dites jika ada | Wajib |  |  |  |
| 12 | Regression test sebelum launch selesai | Wajib |  |  |  |
| 13 | UAT dengan user internal selesai | Wajib |  |  |  |
| 14 | Bug critical sudah ditutup | Wajib |  |  |  |

---

# 11. Monitoring & Observability

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Logging aplikasi aktif | Wajib |  |  |  |
| 2 | Error tracking aktif | Wajib |  |  |  |
| 3 | Uptime monitoring aktif | Wajib |  |  |  |
| 4 | Health check endpoint tersedia | Wajib |  |  |  |
| 5 | Server CPU/RAM/storage bisa dipantau | Wajib |  |  |  |
| 6 | Alert error dikirim ke tim | Disarankan |  |  |  |
| 7 | Crash reporting mobile aktif jika mobile app | Wajib |  |  |  |
| 8 | API latency dipantau | Disarankan |  |  |  |
| 9 | Database monitoring tersedia | Disarankan |  |  |  |
| 10 | Log tidak menyimpan data sensitif | Wajib |  |  |  |

---

# 12. Analytics & Growth Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Analytics tool dipasang | Disarankan |  |  |  |
| 2 | Event tracking utama tersedia | Wajib |  |  |  |
| 3 | Funnel onboarding dilacak | Disarankan |  |  |  |
| 4 | Conversion fitur utama dilacak | Disarankan |  |  |  |
| 5 | Retention user bisa dianalisis | Disarankan |  |  |  |
| 6 | Campaign/referral tracking tersedia jika dibutuhkan | Opsional |  |  |  |
| 7 | Feedback form tersedia | Wajib |  |  |  |
| 8 | Rating/review tersedia jika dibutuhkan | Opsional |  |  |  |

---

# 13. Legal & Compliance Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Terms & Conditions tersedia | Wajib |  |  |  |
| 2 | Privacy Policy tersedia | Wajib |  |  |  |
| 3 | Cookie Policy tersedia jika web membutuhkan cookie | Disarankan |  |  |  |
| 4 | User consent tersedia jika mengumpulkan data pribadi | Wajib |  |  |  |
| 5 | Data deletion request flow tersedia | Disarankan |  |  |  |
| 6 | Refund policy tersedia jika ada transaksi | Wajib |  |  |  |
| 7 | KYC flow tersedia jika dibutuhkan | Wajib jika relevan |  |  |  |
| 8 | Dokumen legal merchant/partner tersedia jika ada partner | Wajib jika relevan |  |  |  |
| 9 | Data retention policy tersedia | Disarankan |  |  |  |
| 10 | Compliance payment gateway dipenuhi | Wajib jika ada payment |  |  |  |

---

# 14. Customer Support Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Channel support tersedia | Wajib |  |  |  |
| 2 | Email support tersedia | Wajib |  |  |  |
| 3 | WhatsApp/chat support tersedia jika dibutuhkan | Disarankan |  |  |  |
| 4 | FAQ tersedia | Disarankan |  |  |  |
| 5 | Help center sederhana tersedia | Opsional |  |  |  |
| 6 | Flow komplain tersedia | Wajib |  |  |  |
| 7 | SLA support internal ditentukan | Disarankan |  |  |  |
| 8 | Template jawaban support tersedia | Disarankan |  |  |  |
| 9 | Escalation flow ke tim teknis tersedia | Wajib |  |  |  |
| 10 | Kontak darurat production tersedia | Wajib |  |  |  |

---

# 15. Super App MVP Readiness

Gunakan bagian ini jika aplikasi memiliki banyak layanan/modul.

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Core app shell tersedia | Wajib |  |  |  |
| 2 | Service hub/menu utama tersedia | Wajib |  |  |  |
| 3 | Modul layanan MVP sudah dipilih | Wajib |  |  |  |
| 4 | Shared auth system tersedia | Wajib |  |  |  |
| 5 | Shared profile tersedia | Wajib |  |  |  |
| 6 | Shared notification tersedia | Disarankan |  |  |  |
| 7 | Shared payment/order core tersedia jika ada transaksi | Wajib jika relevan |  |  |  |
| 8 | Admin panel lintas modul tersedia | Wajib |  |  |  |
| 9 | Role user/provider/merchant/admin jelas | Wajib |  |  |  |
| 10 | Batas antar modul jelas | Wajib |  |  |  |
| 11 | Modul non-MVP disembunyikan/disabled | Wajib |  |  |  |
| 12 | Feature flag tersedia | Disarankan |  |  |  |

---

# 16. Launch Readiness

| No | Checklist | Prioritas | Status | PIC | Catatan |
|---|---|---|---|---|---|
| 1 | Semua blocker sudah ditutup | Wajib |  |  |  |
| 2 | Production deploy berhasil | Wajib |  |  |  |
| 3 | Smoke test production berhasil | Wajib |  |  |  |
| 4 | Backup sebelum launch sudah dibuat | Wajib |  |  |  |
| 5 | Rollback plan siap | Wajib |  |  |  |
| 6 | Monitoring aktif | Wajib |  |  |  |
| 7 | Support team siap | Wajib |  |  |  |
| 8 | Admin team siap | Wajib |  |  |  |
| 9 | Release notes tersedia | Disarankan |  |  |  |
| 10 | Pengumuman launch tersedia jika dibutuhkan | Opsional |  |  |  |
| 11 | PIC standby saat launch ditentukan | Wajib |  |  |  |
| 12 | Post-launch review dijadwalkan | Disarankan |  |  |  |

---

# 17. Form Bug / Issue Saat Review

| No | Area | Deskripsi Bug/Issue | Severity | PIC | Deadline | Status | Catatan |
|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |

Severity:

- `Critical`: aplikasi tidak bisa jalan, data/payment bermasalah, security fatal.
- `High`: fitur utama rusak.
- `Medium`: fitur pendukung bermasalah.
- `Low`: minor UI/copywriting/tidak mengganggu alur utama.

---

# 18. Keputusan Go / No-Go

| Item | Isi |
|---|---|
| Status akhir | Go / No-Go |
| Alasan keputusan |  |
| Risiko yang diterima |  |
| Risiko yang harus ditutup dulu |  |
| Tanggal target perbaikan |  |
| Penanggung jawab akhir |  |
| Tanda tangan Product Owner |  |
| Tanda tangan Tech Lead |  |
| Tanda tangan QA |  |

---

# 19. Ringkasan Nilai Kesiapan

Isi jumlah item berdasarkan status.

| Status | Jumlah |
|---|---:|
| Selesai |  |
| Proses |  |
| Belum |  |
| N/A |  |

Rumus keputusan sederhana:

```text
Go:
- Semua item Wajib berstatus Selesai atau N/A.
- Tidak ada bug Critical.
- Tidak ada bug High pada fitur utama.
- Backup, rollback, monitoring, dan support sudah siap.

No-Go:
- Ada item Wajib yang masih Belum.
- Ada bug Critical.
- Payment/auth/database/deploy belum stabil.
- Tidak ada rollback plan.
```

---

# 20. Catatan Tambahan

Tulis catatan tambahan di sini:

```text







```
