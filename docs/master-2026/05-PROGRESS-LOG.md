# Progress Log

Format wajib per batch (instruksi Owner):

```
## <tanggal> — Batch <ID> <nama>
- Fitur/modul:
- File diubah:
- Hasil pengujian: (tsc / lint / vitest / build / security / browser)
- Branch / commit / PR:
- Risiko DB/VPS:
- Status kesiapan deploy:
- Langkah berikutnya:
```

---

## 2026-10-25 — Batch S0 PHASE 0 Audit read-only

- Fitur/modul: audit read-only MCP, agent key, auth/2FA, cash ledger, CI/deploy, struktur UI;
  roadmap, dependency map, gap analysis, security checklist.
- File diubah: `docs/master-2026/*` (dokumentasi saja).
- Hasil pengujian: tidak relevan (dokumentasi; app lint/build opsional per CLAUDE.md).
- Branch / commit / PR: `claude/jolly-darwin-irvynl` — lihat riwayat git branch ini.
- Risiko DB/VPS: nol. Tidak ada migration, tidak ada perintah ke VPS, push branch tidak memicu deploy.
- Status kesiapan deploy: tidak perlu deploy.
- Langkah berikutnya: Owner menyetujui roadmap + menjawab 7 keputusan di `02-ROADMAP.md`;
  lalu Batch S1 (allowlist `garage_api`, tutup route admin/approval untuk agent, audit sinkron).

## 2026-10-26 — Batch S0 (lanjutan) PRD V4.0 masuk repo + keputusan D-01

- Fitur/modul: PRD Unified V4.0 disimpan verbatim; keputusan Owner D-01 (MCP ChatGPT full access Owner)
  dicatat + daftar bagian PRD yang ditimpa; matriks F01–F55 dengan bukti kode; roadmap ditulis ulang
  mengikuti Fase 0–7 PRD §29; konflik K1–K7.
- File diubah: `PRD/master-2026/*`, `docs/master-2026/*` (dokumentasi saja).
- Hasil pengujian: tidak relevan (dokumentasi).
- Branch / commit / PR: `claude/jolly-darwin-irvynl`, draft PR killuasurya-boop/garage#80.
- Risiko DB/VPS: nol.
- Status kesiapan deploy: tidak perlu deploy.
- Langkah berikutnya: Owner jawab D-01a, D-02, D-03, D-06 + setujui roadmap → Batch S2 → M0.

## 2026-10-26 — Batch S0 (lanjutan) Aya peliharaan Owner masuk plan

- Fitur/modul: keputusan D-07 — Aya (peliharaan Owner) menjadi nama, avatar, dan persona asisten AI
  (F52) di Garage OS + ChatGPT; rencana aset, ekspresi status, motion, batas tampil, persona/suara.
- File diubah: `06-OWNER-DECISIONS.md`, `02-ROADMAP.md` (M5, U1), `07-TRACEABILITY-F01-F55.md` (F52).
- Hasil pengujian: tidak relevan (dokumentasi).
- Risiko DB/VPS: nol.
- Langkah berikutnya: Owner jawab D-07a–e + kirim foto Aya.

## 2026-10-26 — Batch S2 2FA wajib di API

- Fitur/modul: kebijakan `securityRequire2faForOwner` ditegakkan di API. Owner/Manajer tanpa 2FA → `403 TWO_FACTOR_REQUIRED`
  di `/api/*` (kecuali `/api/me`, `/api/account/*`). Halaman tetap redirect ke `/control/2fa`. Menutup F-04.
- File diubah: `src/proxy.ts` (header `x-garage-api-path`), `src/lib/server-auth.ts`, baru `src/lib/two-factor-api-gate.ts`
  + `two-factor-api-gate.test.ts` (9 tes) + `two-factor-api-gate.integration.test.ts` (6 tes PGlite).
- Hasil pengujian: tsc lulus (heap 6 GB) · lint 0 error · vitest 180 file / 1.170 tes lulus · `npm run build` lulus
  (env placeholder seperti Dockerfile) · `db:generate` tanpa perubahan schema · tes integrasi terbukti gagal bila gate dicabut.
  Belum uji browser (tidak ada DB/server di sesi).
- Branch / commit / PR: `claude/s2-2fa-api-gate` · `b51e8c1` · draft PR killuasurya-boop/garage#81.
- Risiko DB/VPS: tanpa migration/data. Bila kebijakan aktif & ada Owner/Manajer belum pasang 2FA, panggilan API langsung mereka ditolak.
- Status kesiapan deploy: siap review; merge = auto-deploy → hanya Owner, di luar jam operasional.
- Catatan untuk agent berikutnya: (1) build lokal butuh `NODE_OPTIONS=--max-old-space-size=6144` + env placeholder Dockerfile
  (`BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime`, `DATABASE_URL=postgresql://build:build@localhost:5432/build`);
  (2) `requireOwnerPrincipal` dipindah ke S1/M0.
- Langkah berikutnya: **M0** (OAuth gateway `/api/mcp/chatgpt`) lalu **S1**.

## 2026-10-26 — Batch M0a + M0 Gateway OAuth MCP ChatGPT

- Fitur/modul:
  - M0a (PR #82): rantai Better Auth disamakan ke 1.7.12 (drizzle-adapter 1.6.23 → 1.7.12, core/better-call/fetch
    dikunci ke versi yang sudah dipakai better-auth), tambah `@better-auth/oauth-provider` 1.7.12. Pilihan Owner:
    "Upgrade Better Auth" (bukan OAuth buatan sendiri).
  - M0 (PR #83, ditumpuk di atas #82): OAuth 2.1 via `@better-auth/mcp` + `jwt`, mati default
    (`GARAGE_MCP_CHATGPT_ENABLED`); `/api/mcp/chatgpt`, `/oauth/consent`, `/.well-known/*`; Owner + 2FA only;
    kill switch `mcpChatgptPaused`; audit sinkron sebelum tool; `garage_api` disembunyikan.
- File utama: `src/lib/mcp-chatgpt-{config,access,gateway,discovery}.ts`, `src/lib/oauth-login-continue.ts`,
  `src/app/api/mcp/chatgpt/route.ts`, `src/app/oauth/consent/page.tsx`, `src/app/.well-known/*`,
  `src/components/garage/admin/mcp-chatgpt-consent.tsx`, `src/lib/auth.ts`, `src/db/schema.ts`, `drizzle/0163_mcp_oauth.sql`.
- Hasil pengujian: tsc lulus · lint 0 error · vitest 180 file / 1.171 tes · build lulus · tes e2e OAuth (DCR, PKCE,
  login + TOTP, consent, token, MCP) · uji browser Playwright 1366×900 & 390×844 (tanpa overflow/error console).
- Branch / PR: `claude/m0a-better-auth-deps` (#82), `claude/m0-mcp-oauth-gateway` (#83). Merge #82 dulu.
- Risiko DB/VPS: migration 0163 additive (8 tabel kosong). Perilaku produksi tidak berubah sampai env dinyalakan.
- Status deploy: siap review. Aktivasi = Owner set env + restart (lihat `docs/AGENT-API.md` §6).
- Catatan untuk agent berikutnya:
  - Tabel OAuth wajib sinkron dengan versi plugin: generate ulang dengan `generateDrizzleSchema` dari
    `@better-auth/drizzle-adapter` bila upgrade Better Auth.
  - Docs Better Auth bisa dibaca dari `raw.githubusercontent.com/better-auth/better-auth/v<versi>/docs/content/docs/plugins/*.mdx`
    (better-auth.com & docs OpenAI tidak terjangkau dari container).
  - Uji browser lokal: `bootstrap-pglite` + `db:seed` + `next start` dengan env flag (skrip contoh di PR #83).
- Langkah berikutnya: **S1** (persempit key non-Owner, audit sinkron `/api/mcp` lama, rate limit persisten) → **M1/M2**
  (registry + preview/konfirmasi) → **M3** (tool 16 domain, pensiunkan `garage_api`).

## 2026-10-26 — Batch S1 Pengerasan API key agent statis

- Fitur/modul: audit agent sinkron sebelum request (tulis + GET data keuangan/laporan/payroll/kontrol), audit gagal →
  `503 AGENT_AUDIT_FAILED` (F-05); key `gk_agent_` scope apa pun ditolak di `/api/admin/users/*` & `/api/admin/security/*`;
  pengaturan `security*` & `mcpChatgpt*` (kill switch) ditolak untuk sesi agent di `updateAppSettings` + DELETE override.
- File diubah: `src/lib/agent-api-key.ts`, baru `src/lib/agent-protected-settings.ts`, `src/lib/garage-service.ts`
  (`updateAppSettings`), `src/app/api/admin/settings/route.ts`, `src/app/api/settings/route.ts`, `docs/AGENT-API.md`,
  tes `agent-api-key.integration.test.ts` (+4).
- Hasil pengujian: tsc lulus · eslint bersih · vitest 178 file / 1.159 tes · build lulus. Tanpa migration.
- Branch / PR: `claude/s1-agent-key-hardening` · `4b711f4` · draft PR killuasurya-boop/garage#84 (independen dari #81–#83).
- Risiko DB/VPS: tanpa migration. Perubahan perilaku: bot OpenClaw/Hermes tidak bisa lagi kelola user/role/keamanan.
- Status deploy: siap review; merge = auto-deploy.
- Catatan agent berikutnya: setelah ganti branch, hapus `.next/` sebelum `tsc` (tipe route lama dari build branch lain
  membuat error palsu).
- Ditunda: F-06 rate limit persisten (butuh tabel → setelah #83 merge supaya nomor migration tidak bentrok),
  audit per-tool di `/api/mcp` lama (pakai `beforeToolCall` dari #83).
- Langkah berikutnya: **M1** (registry tool + risk tier R0–R4) → **M2** (preview → konfirmasi → receipt). Keduanya
  dibangun di atas #83; sebaiknya #82/#83 di-merge dulu agar tidak menumpuk PR berantai.

## 2026-10-26 — Batch M1 Registry kemampuan AI

- Fitur/modul: `src/lib/mcp-tool-registry.ts` (16 domain PRD §04, risiko R0–R3 §07.2, daftar R4, `buildCapabilities`);
  setiap tool di `agent-tools.ts` wajib `domain` + `risk` (tes: `write === risk !== "R0"`); tool baru `kemampuan_sistem`;
  `tools/list` MCP berlabel risiko (`description`, `annotations.destructiveHint`, `_meta garage/risk|domain`);
  instruksi `initialize` mengikuti tool yang tersedia.
- Hasil pengujian: tsc · eslint · vitest 181 file / 1.175 tes · build — semua lulus. Tanpa migration.
- Branch / PR: `claude/m1-mcp-tool-registry` · `319a10d` · draft PR killuasurya-boop/garage#85 (base #83; urutan merge #82 → #83 → #85).
- Risiko DB/VPS: rendah (metadata + 1 tool baca).
- Langkah berikutnya: **M2** — preview → konfirmasi Owner di chat → commit → receipt untuk tool R2/R3
  (`riskNeedsConfirmation`). Rencana: token konfirmasi HMAC terikat digest(tool+args)+user+expiry (tanpa tabel baru),
  readback & operation receipt (PRD §07.4–07.5).

## 2026-10-26 — Batch M2 Preview → konfirmasi → receipt (ChatGPT)

- Fitur/modul: aksi R2/R3 lewat `/api/mcp/chatgpt` tidak langsung jalan: preview (ringkasan dampak dari `tool.preview()`)
  + token sekali pakai 5 menit → Owner setuju di chat → panggilan ulang dengan argumen sama + `konfirmasi` → eksekusi →
  `receipt`. Tabel `mcp_operations` (migration 0164, CLEAR saat reset). Tool `status_operasi`. Token tidak pernah
  disimpan (hash nonce) dan tidak masuk audit. Key statis tidak berubah.
- File: baru `src/lib/mcp-confirmation.ts` (+tes), `src/lib/agent-mcp.ts` (opsi `callTool`, `confirmRiskyTools`),
  `src/lib/agent-tools.ts` (`preview`, `status_operasi`), `src/lib/mcp-chatgpt-gateway.ts`, consent copy, docs.
- Hasil pengujian: tsc · eslint · vitest 182 file / 1.183 tes (termasuk 2 konfirmasi bersamaan → 1 eksekusi) · build.
- Branch / PR: `claude/m2-mcp-confirm` · `446043b` · draft PR killuasurya-boop/garage#86 (base #85).
  **Urutan merge stack: #82 → #83 → #85 → #86** (#81, #84 independen).
- Risiko DB/VPS: migration 0164 additive. Fitur hanya aktif bila `GARAGE_MCP_CHATGPT_ENABLED=true`.
- Belum: D-01a (TOTP Owner untuk R3 di chat — menunggu jawaban Owner), readback generik, konfirmasi untuk key statis.
- Langkah berikutnya: **M3** — tool bisnis eksplisit per domain (16 domain; prioritas P0: shift/kas, keuangan, produk/harga,
  gudang) agar `garage_api` bisa dipensiunkan. Alternatif bila Owner ingin fondasi uang dulu: **B1** (payment state & business_date).

## 2026-10-26 — Batch B1 Tanggal operasional (fondasi)

- Keputusan Owner D-08: cut-off 04:00 WIB, berlaku mulai tanggal efektif (belum ditentukan).
- Fitur/modul: `business-date.ts` (aturan + hari transisi 28 jam, uji properti), `business-date-policy.ts` (baca setting
  lewat handle DB/transaksi), buku kas (`business_date` baris baru), `reports/*` (rentang + label), `sales-report`
  (rentang + pengelompokan), `cash-oversight`, `event-sales-report`. Setting ada di tipe/default tetapi **tidak tampil
  di UI** sampai B1b.
- Hasil pengujian: tsc · eslint · vitest 180 file / 1.165 tes · build. Tanpa migration.
- Branch / PR: `claude/b1-payment-business-date` · `bfd1235` · draft PR killuasurya-boop/garage#87 (independen).
- Risiko DB/VPS: tidak ada perubahan angka selama tanggal efektif kosong.
- Temuan: `finance-control.wibDay` (SQL) & `garage-owner-report.rangeFor` punya hitungan hari sendiri; pengeluaran bertanggal
  pilihan tersimpan 07:00 WIB (aman terhadap cut-off). Payment state via provider tetap BLOCKED (QRIS statis).
- Langkah berikutnya: **B1b** (laba-rugi, closing + kunci hari, laporan Owner, dashboard, preset klien, tampilkan setting).

## 2026-10-26 — Merge MCP ChatGPT + B1b

- **Merge disetujui Owner** ("M0+M1+M2 sekarang"): #86 dipindah base ke `main` lalu di-merge (`dc57846`). Isinya #82, #83, #85 dan #86, sehingga cukup satu push ke main.
- **Deploy VPS run 40281089022 GAGAL sebelum mulai** (2 kali). Job selesai dalam 3–4 detik tanpa runner (runner_id 0) dan log 404. CI di main juga sama.
  - Tidak ada langkah yang jalan: server produksi tidak berubah dan migration 0163/0164 belum jalan.
  - Dugaan: kuota menit/billing GitHub Actions. Owner perlu cek Settings → Billing → Actions, lalu re-run run 40281089022.
- Setelah deploy berhasil, fitur tetap MATI sampai Owner mengisi env VPS `GARAGE_MCP_CHATGPT_ENABLED=true` (URL publik HTTPS) dan restart. Owner wajib 2FA. Langkahnya ada di AGENT-API.md §6.
- **B1b** → PR #88 (draft, base #87, commit 5cc5d0a): tanggal operasional di laba-rugi, closing, laporan Owner, dashboard, preset layar, dan field pengaturan + validasi. 180 file / 1173 tes lulus, build lulus.
- Berikutnya: M3 (tool per domain, pensiunkan garage_api), F-06 rate limit persisten, audit per-tool /api/mcp lama.

## 2026-10-26 — Koordinasi agent kedua + M3a

- **Agent kedua** (sesi "G A R A G E") mengklaim dua batch di komentar PR #80; klaim diterima dan dibalas di sana.
  - **S0b** (sensus layar): branch `claude/s0b-screen-census`.
  - **B3 READY** (tender guard CASH/QRIS, Quick Retail, `payment_reference`): branch `claude/b3-tender-guard-quick-retail`.
  - Migration: 0165 = F-06 (agent pertama), 0166 = B3 (agent kedua).
  - Area POS checkout/pembayaran milik B3; agent pertama tidak menyentuhnya.
- **M3a** → PR #89 (draft, base main, commit 85c90e1). Tool Shift & Kas + Keuangan:
  - R0: pengawasan_kas, daftar_kas_laci, daftar_petty_cash, status_closing_harian
  - R2: putuskan_kas_laci, konfirmasi_setoran, putuskan_petty_cash, verifikasi_shift
  - R3: tutup_buku_harian
  - Hasil uji: 183 file / 1190 tes lulus, build lulus.
- Deploy MCP (run 40281089022) masih gagal tanpa runner; menunggu Owner mengecek billing Actions.
- **Berikutnya:**
  - M3b: POS void/refund lewat approval, harga & status menu, peran staf. Aksi POS hanya membungkus service yang sudah ada; tidak mengubah alur B3.
  - Lalu F-06 (migration 0165).

## 2026-10-26 — M3b

- **M3b** → PR #91 (draft, base #89, commit b92fa38).
  - Tool:
    - riwayat_order (R0), ubah_info_order (R1);
    - batalkan_order / refund_order (R2, lewat APP-VOID/APP-RFD; dari Owner langsung disetujui);
    - koreksi_metode_bayar (R2);
    - daftar_staf (R0), ubah_status_peran_staf (R3, hanya sesi Owner, bukan API key).
  - Hasil uji: 184 file / 1196 tes lulus, build lulus.
- **Ubah harga menu ditunda ke M3c.** `updateMenuProduct` mengganti semua varian (delete + insert), jadi perlu service khusus untuk harga satu varian.
- **Berikutnya:**
  - M3c: harga varian, status menu, kategori produk.
  - M3d: gudang (minta bahan, waste, PO), member/CRM, meja/QR, event.
  - Lalu pensiunkan `garage_api` dari jalur agent key bila Owner setuju.
  - Setelah itu F-06 (migration 0165).

## 2026-10-26 — M3c

- **M3c** → PR #92 (draft, base #91, commit c13990c).
  - Service `updateVariantPrice`:
    - hanya harga satu varian, Owner/Manajer, alasan wajib;
    - proteksi harga basi (STALE_PRICE);
    - audit before/after.
  - Tool:
    - ubah_harga_varian (R2);
    - aksi_produk (R2, bulkProductAction);
    - daftar_kategori_produk (R0).
  - Hasil uji: 185 file / 1199 tes lulus, build lulus.
- **Deploy MCP** (run 40281089022) gagal lagi pada percobaan ke-3: tanpa runner, 4 detik. Owner perlu cek billing/spending limit GitHub Actions (terpisah dari Copilot Pro).
- **Urutan merge stack MCP:** #89 → #91 → #92.
- **Berikutnya:**
  - M3d: gudang (Minta Bahan, waste, PO), member/CRM, meja/QR, event.
  - Lalu F-06.

## 2026-10-26 — M3d (PR #94)

- **M3d** → PR #94 (draft, base #92, commit b4c2296). Tool Gudang:
  - R0: daftar_minta_bahan, daftar_waste, saran_belanja, daftar_po, batch_hampir_kedaluwarsa.
  - R2: kirim_minta_bahan, putuskan_waste, ubah_status_po.
  - R1: buat_po_dari_saran.
  - Hasil uji: 186 file / 1202 tes lulus, build lulus.
- **Stack MCP sekarang:** #89 → #91 → #92 → #94.
- **Berikutnya:**
  - M3e: member/CRM, meja/QR, event, marketing.
  - Lalu F-06 (migration 0165).

## 2026-10-26 — B3 (agent kedua, disalin dari PR #93)

- **B3** → PR #93 (draft, branch `claude/b3-tender-guard-quick-retail`).
  - Tender guard: tunai wajib uang diterima ≥ total, split harus pas.
  - Referensi QRIS/transfer unik per order (advisory lock); setting `qrisReferenceRequired` default mati.
  - Penjualan Langsung / Quick Retail (POS-05): retail saja, tanpa meja, tanpa tiket Bar/Dapur, grup laporan "Penjualan langsung".
  - Tanpa migration. Hasil uji agent kedua: 184 file / 1204 tes.
- **Risiko:** klien yang memanggil `POST /api/orders` Cash tanpa `cashReceived` kini ditolak. Tool MCP (M3a–M3d) tidak memanggil `createOrder`, dan tesnya sudah mengirim `cashReceived`.
- **Butuh keputusan Owner:** Final Bayar Tunai dengan kolom kosong, tetap dihitung "uang pas" atau diblokir seperti PRD?
- **S0b** (sensus layar): belum ada PR saat catatan ini.

## 2026-10-26 — M3e + PR agent kedua

- **M3e** → PR #100 (draft, base #94, commit 03c738f).
  - Member/CRM: cari_member, detail_member, sesuaikan_poin_member (R2).
  - Meja/QR: status_meja, pindah_meja (R1).
  - Event: daftar_event, ringkasan_event, ubah_status_event (R1).
  - Hasil uji: 187 file / 1205 tes lulus, build lulus.
  - Domain tanpa tool tersisa: Bahan & Resep, Konten & Marketing, Email & Notifikasi.
- **Stack MCP:** #89 → #91 → #92 → #94 → #100.
- **PR baru dari agent kedua** (area UI; tidak menyentuh agent-tools/MCP):
  - #95 S0c: overflow responsif (WMS 1024, onboarding & payroll 390).
  - #96 U0a: modul AI Agent dipindah keluar dari garage-app.tsx (10.297 → 2.895 baris).
  - #97 U0b: komponen shell (base #96).
  - #98 U0c: panel checkout & struk POS ke pos/ (base #93 B3).
  - #99 S0d: judul header /os tidak terpotong di HP.
- **Catatan untuk M5 (Aya in-app):** UI AI Agent kini ada di modul terpisah hasil U0a. Kerjakan M5 setelah #96 merge.
- **Berikutnya:**
  - F-06 rate limit persisten (migration 0165).
  - Lalu M3f: Bahan & Resep (approve resep draft).

## 2026-10-26 — F-06 (PR #101)

- **F-06** → PR #101 (draft, base main, commit 873d06b).
  - Tabel `rate_limit_counters` (migration **0165**, additive) dengan increment atomik.
  - API key agent: 120/menit per key, kini di DB (tahan restart, lintas proses).
  - `/api/mcp/chatgpt`: 60/menit per akun Owner → 429 `RATE_LIMITED`.
  - Rate limit publik per-IP tetap in-memory.
  - Hasil uji: 5 tes baru (restart, 25 permintaan bersamaan, 429 key & ChatGPT). Suite 183 file / 1188 tes lulus, build lulus.
  - Konflik ringan dengan #84 (S1) di `agent-api-key.ts`; selesaikan saat merge kedua.
- **Berikutnya:** M3f Bahan & Resep (approve resep draft via MCP), lalu audit per-tool `/api/mcp` lama.
