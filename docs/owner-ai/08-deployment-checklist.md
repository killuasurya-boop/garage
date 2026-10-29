# 08 — Checklist deploy Owner AI (Phase 1–3)

Deploy hanya atas perintah Owner, saat **tidak ada shift terbuka**, dari laptop (`docs/DEPLOY_MANUAL.md`).

## Urutan merge

1. PR #145 (Phase 0–1, migrasi **0175**) → main.
2. PR #146 (Phase 2, tanpa migrasi) → main (base otomatis pindah ke main setelah #145).
3. PR Phase 3 (tanpa migrasi) → main.
4. Bila PR Fase 3 audit (migrasi **0176** pencairan fee) ikut: periksa `drizzle/meta/_journal.json` berisi 0175 lalu 0176 berurutan.

## Sebelum deploy

- [ ] `git checkout main && git pull` → `bash scripts/release-check.sh` = **RILIS SIAP** (tsc, lint, vitest, build, katalog API, lock npm 10).
- [ ] Cek shift terbuka = 0 (Pengawasan Kas / query baca).
- [ ] Migrasi additive saja: 0175 = 2 tabel baru (`ai_connections`, `ai_verification_challenges`). Tidak ada DROP data.

## Deploy

- [ ] `bash scripts/deploy-manual.sh --yes` (backup pre-deploy → migrate → up → health → smoke; gagal = rollback otomatis).

## Sesudah deploy (Owner, ±10 menit)

- [ ] Buka **Garage Control → AI Connect**: Server MCP **Online**, Identitas **Terverifikasi** (2FA Owner aktif).
- [ ] Dari ChatGPT web: sambungkan connector (URL dari AI Connect), lalu **Buat kode verifikasi** → ketik di ChatGPT
      "Verifikasi koneksi Garage OS dengan kode XXXX-XXXX" → status **AI VERIFIED**. *Ini satu-satunya bukti AC-02 nyata.*
- [ ] Coba perintah baca di ChatGPT ("Berapa omzet hari ini?") → Akses tool: baca terbukti.
- [ ] (Opsional) satu perubahan kecil R1/R2 lewat ChatGPT atau **AI Command** → receipt + muncul di Timeline operasi.
- [ ] Uji darurat: saklar **Jeda** di AI Connect → ChatGPT ditolak → matikan Jeda lagi.

## Bila paket ChatGPT tidak mendukung connector/tulis

Status tetap jujur (Link: belum diverifikasi / Akses tool: belum terbukti). Semua perubahan tetap bisa lewat **AI Command**
(mesin & aturan sama). Tidak ada bypass.
