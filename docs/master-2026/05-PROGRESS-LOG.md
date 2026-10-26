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
