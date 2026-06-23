# FINAL FUNCTIONAL AUDIT CHECKLIST — GARAGE OS

> Tracker hidup audit fungsional 100% sesuai mandat. Branch kerja:
> `final-functional-audit-garage-os`. Diisi bertahap per role; commit per role
> setelah test lulus.

## 0. Pemahaman Project (selesai)

**Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, lucide-react,
Drizzle ORM (PGlite lokal / PostgreSQL produksi), Better Auth (identitas), Vitest.

**Sumber kebenaran kunci:**
- RBAC: `src/lib/role-access.ts` (`rolePermissions`, `roleModules`, `canUseApi`, `canAccessModule`).
- Tipe Role & ModuleId: `src/lib/garage-data.ts`.
- Guard server: `src/lib/server-auth.ts` (`requirePermission`, `requireAnyPermission`, `requireGarageSession`).
- Layanan data/mutasi: `src/lib/garage-service.ts`.
- Shell aplikasi & gating modul: `src/components/garage/garage-app.tsx`.

**Role aplikasi (lebih kaya dari 7 role mandat) → pemetaan:**
| Role mandat | Role aplikasi |
|---|---|
| Kasir | `Kasir` |
| Barista | `Barista` |
| Koki / Kitchen | `Koki`, `Asisten Koki`, `Kitchen / Barista` |
| Waiter | `Waiter 1`, `Waiter 2` |
| Admin Finance | `Finance / CFO` |
| Manager | `Manager Operasional` |
| Owner | `Owner / CEO` |
| (tambahan) | `Admin`, `Supervisor Shift`, `Gudang`, `Delivery Admin` |

**Modul:** dashboard, pos, ai-agent, kitchen, waiter, inventory, finance, crm,
membership, marketing, approvals, website, company-control, earnings, audit,
chat, smart-notif, team-management, settings, training, recruitment.

---

## 1. Lapisan Keamanan & Permission (SELESAI — test lulus)

| Fitur diuji | Skenario | Status bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Owner akses penuh | Owner punya semua permission + modul monitoring | OK | — | ✅ `role-access.test.ts` | ⏳ |
| Kasir isolasi | Kasir tak bisa dashboard owner/finance/company/audit | OK | — | ✅ | ⏳ |
| Barista/Koki isolasi | Tak bisa finance/pos/company | OK | — | ✅ | ⏳ |
| Waiter isolasi | Tak bisa finance/cash/company/audit | OK | — | ✅ | ⏳ |
| Finance/CFO batas | Boleh finance, tak boleh company:manage/staff:manage | OK | — | ✅ | ⏳ |
| Manager batas | Tak punya company:manage | OK | — | ✅ | ⏳ |
| Gudang batas | Hanya inventory | OK | — | ✅ | ⏳ |
| Konsistensi modul↔permission | Modul data (pos/kitchen/inventory/crm/approvals/audit/team) wajib punya read-permission | OK utk 7 modul | — | ✅ | ⏳ |
| Stale test `firstModuleForRole(Admin)` | Test lama harap `dashboard`, padahal Admin sengaja tanpa dashboard | DIPERBAIKI | Ubah ekspektasi → `pos` | ✅ `garage-data.test.ts` | ⏳ |

---

## 2. TEMUAN TERBUKA (perlu keputusan / lanjutan)

| # | Temuan | Dampak | Rekomendasi |
|---|---|---|---|
| F-01 | `Manager Operasional` punya modul `finance` & `earnings` di sidebar, tapi permission `finance:read`/`earnings:read` tidak ada | Manager klik Finance/Earnings → modul muncul lalu data 403 (modul "putus") | Keputusan owner: (a) beri `finance:read`+`earnings:read` (monitoring read-only) ATAU (b) hapus modul finance/earnings dari Manager. Tercatat sbg `it.todo` di `role-access.test.ts` |

---

## 3. Audit Fungsional per Role (BERJALAN)

Status: ⬜ belum • 🔄 berjalan • ✅ selesai (test lulus + commit)

### STEP 1 — Kasir 🔄
| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Login → modul awal POS | `firstModuleForRole('Kasir')==='pos'` | OK | — | ✅ | ⏳ |
| Buat order, pilih meja, tambah item makanan+minuman | POS cart | — | — | ⬜ | ⬜ |
| Catatan, qty, hapus item | cart mutate | — | — | ⬜ | ⬜ |
| Voucher/diskon di checkout | dialog bayar | — | — | ⬜ | ⬜ |
| Hitung subtotal/service/PB1/total | `calculateBillingTotals` | — | — | ⬜ | ⬜ |
| Bayar cash & QRIS | `createOrder` | — | — | ⬜ | ⬜ |
| Struk + order → kitchen/bar (KDS) | tiket per station | — | — | ⬜ | ⬜ |
| Sinkron ke waiter/finance/owner | cross-module | — | — | ⬜ | ⬜ |
| Error handling (meja kosong, dll) | validasi | — | — | ⬜ | ⬜ |

### STEP 2 — Barista ⬜
### STEP 3 — Koki / Kitchen ⬜
### STEP 4 — Waiter ⬜
### STEP 5 — Admin Finance (Finance / CFO) ⬜
### STEP 6 — Manager (Manager Operasional) ⬜
### STEP 7 — Owner (Owner / CEO) ⬜

---

## 4. Audit Lintas-Modul (BERJALAN)
- ⬜ Settings mengontrol fitur penting (`garage-settings-schema.ts`)
- ⬜ Website/landing + recruitment sinkron dashboard
- ⬜ UI/UX responsive desktop/tablet/mobile
- ⬜ Relasi DB (order↔meja↔kasir↔kitchen↔waiter↔finance↔owner)

---

## 5. Deliverable Dokumentasi
- ⬜ `docs/BUKU_PINTAR_GARAGE_OS.md`
- ⬜ `docs/FINAL_FUNCTIONAL_AUDIT_REPORT.md`

---

_Update terakhir: lapisan keamanan/permission + perbaikan test stale; suite Vitest hijau (70 pass, 1 todo)._
