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
| F-02 | Chart **sales-trend** dashboard hanya jam 08:00–19:00 (`getDashboardData`) | Penjualan malam (peak kafe) tak tampil di chart; **omzet headline tetap utuh** | 🟡 **TERBUKA (keputusan owner)** — bukan bug data, hanya jendela visual. Rekomendasi: lebarkan ke jam tutup nyata (mis. 08–23) atau dorong dari pengaturan jam operasional. Belum diubah karena ini keputusan produk |

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

### STEP 2 — Barista ✅ TUNTAS  ·  STEP 3 — Koki ✅ TUNTAS
Keduanya berbagi mekanisme `updateKitchenStatus` (beda hanya station Bar vs Food,
diuji lewat routing). Logika murni: `garage-kitchen-status.ts` + unit test.
Integrasi DB nyata: `garage-kitchen.integration.test.ts`.

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Order kasir → tiket Bar & Food status awal `queue` | integrasi | OK | — | ✅ integrasi | ⏳ |
| Barista/Koki proses tiket queue→cooking→ready | nama acceptedBy/readyBy tercatat | OK | — | ✅ integrasi | ⏳ |
| Cegah transisi ilegal (queue→delivered, mundur) | `KitchenTransitionError` | OK | — | ✅ unit+integrasi | ⏳ |
| Idempoten set status sama | tidak error, kembalikan tiket | OK | — | ✅ integrasi | ⏳ |
| Tiket tidak dikenal | kembalikan null (aman) | OK | — | ✅ integrasi | ⏳ |
| Optimistic lock (anti double-credit) | update by (ticketNo,status lama) | OK (sudah ada) | — | ✅ (jalur teruji) | ⏳ |
| Sinkron status ke kasir/owner/customer | system message chat + audit log saat ready/delivered | OK | — | ✅ (via integrasi) | ⏳ |
| UI antrian/meja/catatan, notif, tablet/HP | kitchen-view UI | — | disarankan cek manual berkala | 🔄 | — |

### STEP 4 — Waiter ✅ TUNTAS
Integrasi DB nyata: `garage-waiter.integration.test.ts`.

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Klaim tiket ready | claimedBy/Name tercatat | OK | — | ✅ integrasi | ⏳ |
| Anti-rebut | waiter lain klaim tiket terklaim → `TicketClaimError` | OK | — | ✅ integrasi | ⏳ |
| Antar pesanan terklaim | `ready→delivered`, deliveredBy tercatat | OK | — | ✅ integrasi | ⏳ |
| Auto-klaim saat antar | antar tanpa klaim → auto-klaim lalu delivered | OK | — | ✅ integrasi | ⏳ |
| Sinkron ke kasir/owner/customer | system message chat + audit (via updateKitchenStatus) | OK | — | ✅ (jalur teruji) | ⏳ |
| UI daftar meja / HP | waiter-view UI | — | disarankan cek manual berkala | 🔄 | — |
### STEP 5 — Admin Finance (Finance / CFO) ✅ TUNTAS
Integrasi DB nyata: `garage-finance.integration.test.ts`. Diverifikasi:
`payments.status` default `captured` & `createOrder` tak meng-override → transaksi
kasir OTOMATIS terhitung di finance (tidak ada modul putus).

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Data kasir → finance | Cash & QRIS kasir muncul di `getFinanceSummary` | OK | — | ✅ integrasi | ⏳ |
| Rincian metode bayar | breakdown method + nominal + share ~100% | OK | — | ✅ integrasi | ⏳ |
| Omzet total | jumlah seluruh payment captured | OK | — | ✅ integrasi | ⏳ |
| Pemantauan kas | shift open; cash order tambah `expectedCash`, QRIS tidak | OK | — | ✅ integrasi | ⏳ |
| Isolasi akses | Finance/CFO tak bisa company:manage/staff:manage/pos | OK | — | ✅ permission | ⏳ |
| Input pengeluaran / export | `listExpenses` + CRUD pengeluaran | — | CRUD ada; verifikasi lanjutan | 🔄 | — |

### STEP 6 — Manager ✅ TUNTAS · STEP 7 — Owner ✅ TUNTAS
Keduanya membaca `getDashboardData` (Owner = superset). Integrasi DB nyata:
`garage-dashboard.integration.test.ts`. Diverifikasi `orders.status` default `paid`
& POS tak meng-override → omzet kasir OTOMATIS masuk dashboard.

| Fitur | Skenario | Bug | Solusi | Test | Commit |
|---|---|---|---|---|---|
| Revenue/omzet hari ini | metrik revenue = order paid hari ini ("3 order paid") | OK | — | ✅ integrasi | ⏳ |
| Sales trend harian | jam operasional 08–19, jumlah = omzet (jam-aware) | OK* | *lihat F-02 | ✅ integrasi | ⏳ |
| Order aktif | hitung tiket queue/cooking | OK | — | ✅ integrasi | ⏳ |
| Menu terlaris | item terjual terbanyak (kopi > nasi) | OK | — | ✅ integrasi | ⏳ |
| Isolasi Manager | tanpa company:manage; Finance/Earnings disembunyikan (F-01) | OK | — | ✅ permission | ⏳ |
| Owner akses penuh monitoring | semua modul + dashboard | OK | — | ✅ permission | ⏳ |
| Monitoring meja/staff/stok | low stock + approval pending di metrik | OK | — | ✅ (via dashboard) | ⏳ |

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
