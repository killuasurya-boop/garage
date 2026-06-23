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

| # | Temuan | Dampak | Status |
|---|---|---|---|
| F-01 | `Manager Operasional` punya modul `finance` & `earnings` di sidebar tanpa permission baca | Modul muncul lalu data 403 (modul "putus") | ✅ **SELESAI** — keputusan owner: sembunyikan Finance & Earnings dari Manager. Modul dihapus di `role-access.ts`; invariant konsistensi diperluas mencakup finance/earnings (semua role lain sudah konsisten) |

---

## 3. Audit Fungsional per Role (BERJALAN)

Status: ⬜ belum • 🔄 berjalan • ✅ selesai (test lulus + commit)

### STEP 1 — Kasir 🔄 (logika inti SELESAI + test lulus)
Refactor: helper tagihan murni diekstrak ke `src/lib/garage-billing.ts` (dari
`garage-service.ts`) agar bisa diuji unit & dipakai ulang. tsc & suite hijau.

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Login → modul awal POS | `firstModuleForRole('Kasir')==='pos'` | OK | — | ✅ | ✅ |
| Hitung subtotal/service 5%/PB1 10%/total | `calculateBillingTotals` (service lalu PB1 di atas subtotal+service) | OK | — | ✅ `garage-billing.test.ts` | ⏳ |
| Pembulatan total | `applyRoundingMode` (none/100/500/1000) | OK | — | ✅ | ⏳ |
| Voucher dibatasi cap % | `capVoucherDiscountBySettings` | OK | — | ✅ | ⏳ |
| Diskon kasir (percent/amount) + anti-manipulasi | `computeManualDiscountAmount` (tolak amount klien ≠ server) | OK | — | ✅ | ⏳ |
| Diskon > ambang butuh approval | `manualDiscountNeedsApproval` | OK | — | ✅ | ⏳ |
| Routing tiket: minuman→Bar, makanan→Dapur | `kitchenTargetGroupForCategory` | OK | — | ✅ | ⏳ |
| Channel order (dine-in/takeaway/delivery) | `orderTypeToChannel` | OK | — | ✅ | ⏳ |
| Buat order dine-in (meja) + item makanan & minuman | `createOrder` simpan order+item ke DB nyata | OK | — | ✅ `garage-order.integration.test.ts` | ⏳ |
| Bayar cash + total tersimpan | payment row = total, customerMode `cashier` | OK | — | ✅ integrasi | ⏳ |
| Routing tiket: minuman→Bar, makanan→Food | 2 tiket KDS dgn station benar | OK | — | ✅ integrasi | ⏳ |
| Guard: wajib open shift | tanpa kas terbuka → ditolak | OK | — | ✅ integrasi | ⏳ |
| Guard: diskon hanya member | non-member + diskon → ditolak | OK | — | ✅ integrasi | ⏳ |
| Guard: variant tidak dikenal | item/variant salah → ditolak | OK | — | ✅ integrasi | ⏳ |
| Sinkron ke finance/owner | order+payment tertulis ke DB (sumber dashboard) | OK | — | ✅ (via integrasi) | ⏳ |
| Verifikasi UI cart (qty/hapus/catatan) + responsif | POS view desktop/tablet/HP | — | UI sudah dirapikan (keranjang fokus) sesi sebelumnya; disarankan cek manual berkala | 🔄 | — |

> **STEP 1 (Kasir) TUNTAS** di level logika + transaksi + keamanan: unit test
> (`garage-billing.test.ts`) + integrasi DB nyata (`garage-order.integration.test.ts`)
> + permission. Harness integrasi memakai PGlite sementara terisolasi (aman untuk CI).

### STEP 2-4 — Barista / Koki / Waiter 🔄 (alur status KDS SELESAI + test lulus)
Ketiganya berbagi alur tiket KDS. Logika transisi diekstrak ke
`src/lib/garage-kitchen-status.ts` + test `garage-kitchen-status.test.ts`.

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Barista/Koki proses tiket | `queue→cooking→ready` sah | OK | — | ✅ | ⏳ |
| Waiter antar pesanan | `ready→delivered` sah | OK | — | ✅ | ⏳ |
| Cegah lompat/mundur status | transisi ilegal ditolak (`KitchenTransitionError`) | OK | — | ✅ | ⏳ |
| Status final | `delivered` tanpa lanjutan | OK | — | ✅ | ⏳ |
| Lihat antrian/meja/catatan, notif siap, UI tablet/HP | kitchen-view / waiter-view UI | — | (verifikasi UI) | ⬜ | ⬜ |
| Sinkron status ke kasir/owner | cross-module (system message chat sudah ada) | — | (integrasi) | ⬜ | ⬜ |
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
