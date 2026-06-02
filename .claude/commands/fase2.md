---
description: FASE 2 — Cek Kesiapan (Readiness Audit) Garage OS
argument-hint: "[opsional: scope khusus, mis. security / performance / ui]"
---

# FASE 2 — Readiness Audit

Kamu **WAJIB planning mode** (no edit). Tugas: cek kesiapan Garage OS sebelum pre-deploy.

## Sumber acuan

@GARAGE_OS_CHECKLIST_FINAL_MAKSIMAL.md
@STRUKTUR APLIKASI.MD
@POLA_KERJA_AI_AGENT.md
@CLAUDE.md

## Argumen
Scope: **$ARGUMENTS** (kosong → audit semua scope).

## Cara Kerja

### Langkah 1 — Verifikasi Fase 1 Selesai
- Konfirmasi semua MVP checklist (section 35) sudah ✅
- Jika belum, **STOP** dan arahkan user kembali ke `/fase1`

### Langkah 2 — Audit 6 Dimensi (dari POLA_KERJA_AI_AGENT.md section 2.1–2.6)

Untuk tiap dimensi, baca file/config terkait di codebase + tandai status:

#### 2.1 Functional
Acuan: `STRUKTUR APLIKASI.MD` section 3 + `CHECKLIST` section 30 (Cross-Modul Integration).
- POS → Kitchen → Waiter → Finance → Audit flow utuh?
- Cek file: `src/components/garage/garage-app.tsx`, `waiter-view.tsx`, `kitchen-eta-panel.tsx`, `finance/*`, `audit-log-viewer.tsx`

#### 2.2 Security
Acuan: `CHECKLIST` section 31.
- `src/lib/auth.ts`, `role-access.ts`, `page-access.ts`
- Cek semua `src/app/api/**/route.ts` → ada Zod + auth + permission?
- CEO Control 2FA → `src/components/garage/admin/two-factor-*`
- `src/scripts/garage-security-audit.ts` ada/jalan?

#### 2.3 Performance
Acuan: `CHECKLIST` section 32.
- Index DB di `src/db/schema.ts`
- Lazy load komponen berat
- POS rendering (`warehouse-cashier-pos.tsx`, `pos-upsell-panel.tsx`)

#### 2.4 UI/UX
Acuan: `CHECKLIST` section 4 + `CLAUDE.md` (Design Direction).
- Tema asphalt/chrome/red/amber di `src/app/globals.css`
- Responsive: cek `tailwind` class breakpoints di komponen besar
- Tidak ada gaya SaaS generik

#### 2.5 Reliability
Acuan: `CHECKLIST` section 33.
- Offline queue design POS
- Health dashboard (`src/components/garage/admin/health-dashboard.tsx`)
- Client error reporter (`client-error-reporter.tsx`)
- Backup script (`scripts/backup.mjs`)

#### 2.6 Build & Test
Cek script di `package.json`:
- `db:generate`, `lint`, `build`, `db:migrate`, `db:seed`
- Tidak menjalankan, hanya verifikasi keberadaan + konfigurasi

### Langkah 3 — Laporan Planning Mode

```
# FASE 2 — Readiness Report

## Status Per Dimensi
| Dimensi | Status | Skor (x/total) | Blocker |
|---|---|---|---|
| Functional | ✅/🟡/❌ | 18/22 | ... |
| Security | ... | ... | ... |
| Performance | ... | ... | ... |
| UI/UX | ... | ... | ... |
| Reliability | ... | ... | ... |
| Build & Test | ... | ... | ... |

## Temuan Detail
### Security
- ⚠️ `src/app/api/.../route.ts` — belum ada permission check
- ❌ Rate limit endpoint login belum direncanakan
...

### Performance
...

## Cross-Modul Integration (section 30)
- [ ] POS → Kitchen → Waiter ✅/❌
- [ ] POS → CRM → Membership ✅/❌
- [ ] Inventory → Smart Notif → PO → Finance ✅/❌
- [ ] HR → Attendance → Payroll → Dashboard ✅/❌
- [ ] Marketing → CRM Segment → Membership ✅/❌
- [ ] Approvals → Audit → Risk ✅/❌

## Go/No-Go ke FASE 3
[ ] Semua dimensi ✅ (atau hanya 🟡 minor)
[ ] Tidak ada ⚠️ RISK kritis di Security
[ ] Build & lint hijau
[ ] Backup script siap

Keputusan: **GO / NO-GO ke FASE 3**

## Rekomendasi Perbaikan (urut prioritas)
1. [Kritis] ...
2. [Tinggi] ...
3. [Sedang] ...
```

## Aturan
- **JANGAN edit file**.
- **JANGAN spawn agent**.
- Setiap temuan harus punya **path file** + **rekomendasi konkret**.
- Bahasa Indonesia.
