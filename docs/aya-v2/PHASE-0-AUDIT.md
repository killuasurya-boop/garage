# AYA V2 — Phase 0 Audit (baseline main 4f74bf5, 4 Nov 2026)

Audit read-only dari kode `origin/main` 4f74bf5 (= versi produksi, deploy 4 Nov 2026 04:24 WIB, smoke test lulus).
Mengisi §25 "Matriks Status Proyek" di [AYA_V2_MASTER_SPEC_CLAUDE_CODE.md](AYA_V2_MASTER_SPEC_CLAUDE_CODE.md).
Status: **Ada** (di kode & produksi) · **Sebagian** · **Belum**. "Ada" berarti kodenya ada, bukan berarti sudah memenuhi target V2.
VPS, biaya API aktual, dan perangkat kasir/KDS **belum** diukur di audit ini.

## Stack (terverifikasi)
Next.js 16 (App Router) + React 19 + TypeScript, Drizzle + PostgreSQL (PGlite untuk tes), Better Auth, Vitest + Playwright.
Deploy manual ke VPS: `scripts/release-check.sh` (wajib lulus) → `scripts/deploy-manual.sh` (build image di laptop → backup DB → migrasi → health → smoke → rollback otomatis). CI GitHub Actions `ci.yml` ada, **saat ini tidak jalan karena billing akun**.

## §25 Matriks status

| Komponen | Target V2 | Status | Bukti / yang sudah bisa dipakai ulang | Celah |
|---|---|---|---|---|
| AYA Character UI | SVG resmi + 8 state + animasi | Sebagian | `src/components/garage/aya/aya-character.tsx`, `aya-floating-pet.tsx`, `aya.css` (11 keyframes), `public/garage-brand/aya/aya-{avatar,full}.svg` (karakter V1, keputusan D-07) | Belum memakai `design-kit/assets/aya_master.svg` & 8 state V2; belum ada state machine `idle/listening/speaking/thinking/warning/success/guiding/error` |
| Voice & SFX | TTS/STT Indonesia, caption, mute, SFX | Sebagian | `src/lib/garage-voice.ts` (Web Speech API + WebAudio, channel kasir/kitchen/bar/warning, unlock via gesture), `voice-settings-dialog.tsx`, `/api/ai/tts` (ElevenLabs, flag `ELEVENLABS_TTS_ENABLED`, belum aktif) | Belum ada STT dengan consent, caption Aya, lip-sync fallback, SFX library Aya |
| Public Website Guide | FAQ publik, scroll/highlight, IG, lokasi, cara pesan | Sebagian | `/order` + `AyaFloatingPet scope="order"` + `order/aya-greeting.tsx`; persona customer di `src/lib/garage-ai-persona.ts` | Belum ada chat/perintah Aya untuk customer, anchor navigation, highlight. **Konflik aturan: lihat bawah** |
| OpenAI Intelligence | Orchestrator aman + budget | Sebagian | `src/lib/garage-ai-providers.ts` (OpenAI Responses API di server, fallback OpenRouter/Gemini, `file_search` vector store, estimasi biaya per run), `/api/ai/pos-agent`, riwayat chat Owner | Aya in-app **tidak memakai function calling ke tool registry** (hanya snapshot konteks + file_search). Tidak ada batas biaya yang memblokir (hanya estimasi) |
| Garage OS MCP/API | Tool gateway berbasis role | Ada (untuk ChatGPT) / Sebagian (untuk Aya) | `src/lib/mcp-tool-registry.ts`, `agent-tools*.ts`, `agent-tool-core.ts` (risk R0–R3, `confirmOnly`, permission), `mcp-chatgpt-gateway.ts` (OAuth, Owner aktif + 2FA, kill switch, audit sinkron), `mcp-confirmation.ts` (preview → token sekali pakai 5 menit → eksekusi → receipt), `mcp-tool-audit.ts`, `/api/agent/v1/*` | Aya in-app belum lewat `runAgentTool`; belum ada filter tool per peran staf |
| Employee Operations | Waiter/Bar/Kitchen/Kasir/WMS | Sebagian | `src/lib/aya-reminders.ts` + `aya-staff-companion.tsx` (pengingat per peran/stasiun dari `/api/ops-center`, polling 60 dtk), `garage-ai-staff-supervision.ts`, `garage-ai-shift-copilot.ts`, Production Hub V4 | Belum ada SOP guide interaktif, quick actions, ack/eskalasi per tugas |
| Alerts & Audio Routing | Prioritas, departemen, dedupe, eskalasi | Sebagian | `src/lib/staff-notifications.ts` (audience per peran), `smart-notif-service.ts`, `production-hub/use-hub-sound.ts` | **PR #159 Smart Notification V2 masih OPEN** (audience Bar ≠ Dapur, ready_to_deliver ke waiter, sound-claim lintas tab, resolved_at, migrasi `0177`). Fondasi alert V2 harus menunggu/menyatu dengan #159 |
| Owner Assistant | Data aktual + tool approval | Ada lewat ChatGPT MCP / Sebagian lewat Aya | ChatGPT MCP: laporan, kas, WMS, master, fraud, marketing, ubah data (R2/R3 dengan konfirmasi). Aya Owner chat: `owner_free_chat` di `/api/ai/pos-agent` | Aya Owner belum bisa memanggil tool yang sama dengan ChatGPT |
| Deployment Awareness | Release record, status verified | Belum | `deploy-manual.sh` sudah punya bukti (backup, `Migrations done`, health 200, smoke) tapi hanya di `deploy-logs/` laptop | Tidak ada tabel rilis, tidak ada versi/commit di `/api/health`, tidak ada notifikasi deploy, tidak ada What's New |
| Responsive / QA | Desktop, tablet, mobile | Sebagian | Playwright E2E 7 alur kritis, vitest 1658 tes | Belum ada snapshot 8 state Aya, matriks role-leakage/prompt-injection |

## Konflik & keputusan yang dibutuhkan dari Owner (BLOCKER)

1. ~~**Customer order dari menu digital.**~~ **SELESAI — diputuskan Owner 4 Nov 2026 ([OD-01](OWNER-DECISIONS.md)):** customer **tetap** memesan di `/order` (`member-order-page.tsx`: checkout QR meja, event checkout, bukti bayar via `/api/customer/orders`, `/api/customer/orders/payment-proof`; status menerima order mengikuti shift kasir via `/api/customer/ordering-status`). Aya memandu cara pesan dan **menunjuk dengan tangan (state `guiding`) ke tombol** yang tepat. Tidak perlu sakelar "lihat saja".
2. **Identitas visual.** Spec menetapkan `design-kit/assets/aya_master.svg` sebagai bentuk resmi. Karakter V1 di `public/garage-brand/aya/` (D-07, 27 Okt) masih dipakai di POS, Production Hub, dan /order. Penggantian = keputusan visual Owner; disarankan ganti sekaligus di Phase 1 dengan fallback SVG ringan.
3. **Biaya.** OpenAI API, ElevenLabs, dan STT server berbayar. Spec: jangan aktifkan layanan berbayar tanpa izin. Default V2 = Web Speech API (gratis) + batas biaya harian OpenAI yang ditentukan Owner (angka belum ada).

## Urutan kerja yang disarankan (menyesuaikan §17 dengan kondisi kode)
1. **Prasyarat:** selesaikan PR #159 (Smart Notification V2) dulu atau rebase di atasnya. Versi/commit di `/api/health`.
2. **Phase 1 (P0):** `AyaMascot` (prop `state/size/muted/reducedMotion/role`) memakai SVG V2, 8 state, menggantikan V1 di semua titik pemasangan; tidak menutupi POS/KDS.
3. **Phase 4+5 (inti nilai):** Aya in-app memakai tool registry yang sama dengan ChatGPT (function calling → `runAgentTool`), daftar tool difilter per peran, R2/R3 lewat `mcp-confirmation`, budget guard yang memblokir.
4. **Phase 8:** tabel rilis + endpoint ber-secret yang dipanggil `deploy-manual.sh` **setelah smoke test lulus** → `deployed_verified`; rollback → `rolled_back`; notifikasi Owner + What's New per divisi.
5. **Phase 2/3/6/7/9** sesuai §17, setelah keputusan Owner untuk blocker di atas.
