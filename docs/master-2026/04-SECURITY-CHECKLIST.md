# Security Checklist — Garage OS Master 2026

Baseline: OWASP ASVS 5.0 (PRD §27). Acceptance criteria lengkap: PRD §28 (AC-F, AC-R, AC-I, AC-P, AC-M, AC-U).

Centang hanya bila sudah diverifikasi dengan test/bukti. Referensi temuan: `01-AUDIT-PHASE0.md`.

## A. VPS / GitHub / deploy (agent tidak boleh mengubah — hanya verifikasi & usulan)
- [ ] Branch protection `main`: wajib PR, wajib CI hijau, larang force push & delete (Owner)
- [ ] Environment `production` punya required reviewer = Owner (Owner)
- [ ] Registrasi workflow WMS yatim dinonaktifkan (Owner, F-09)
- [ ] Tidak ada secret di repo (`.env*` di-gitignore; jalankan secret scanning sebelum PR)
- [ ] Setiap migration baru additive & reversible-by-forward; diuji PGlite + staging
- [ ] Rencana: deploy user non-root (F-11) — usulan, butuh izin Owner
- [x] Push ke branch `claude/*` tidak memicu deploy (diverifikasi dari `ci.yml`/`deploy.yml`)

## B. MCP / agent AI (sesuai D-01: Owner full access, R4 tetap ditolak)
- [x] Koneksi ChatGPT Owner lewat OAuth 2.1 + PKCE (`/api/mcp/chatgpt`), bukan bearer statis (M0) — PR #83 (belum merge)
- [ ] Owner via MCP bisa semua aksi R0–R3 yang bisa dilakukan di UI Owner (M3)
- [x] R2/R3: preview → konfirmasi Owner di chat (token sekali pakai terikat sidik argumen) → eksekusi → receipt — PR #86 (belum merge; readback generik belum)
- [ ] R4 ditolak di semua jalur: hapus/edit ledger & audit, SQL bebas, shell, baca secret
- [x] Key statis (scope apa pun) tidak bisa: pengaturan keamanan/kill switch, user/role/PIN/reset/sesi, force-logout — PR #84 (belum merge). Sertifikasi saldo sudah `requireGarageSession(["Owner"])` → key `manajer` ditolak
- [~] Kill-switch MCP berfungsi (`mcpChatgptPaused`, PR #83); revoke token per-klien via UI belum ada (AC-M07)
- [x] Audit agent sinkron, gagal audit = request gagal; GET data finansial diaudit (F-05) — PR #84 (belum merge)
- [ ] Rate limit agent persisten lintas restart (F-06)
- [ ] Prompt-injection: output tool tidak dieksekusi sebagai instruksi; deskripsi tool tanpa data user
- [ ] Test: tiap route Owner-only menolak key non-Owner (403) dan menerima Owner via OAuth MCP

## C. Identitas
- [x] 2FA wajib Owner/Manajer ditegakkan di API, bukan hanya halaman (F-04) — PR #81, tes `two-factor-api-gate*.test.ts` (belum merge)
- [ ] Google Login hanya link ke akun existing; tidak membuat staff profile/role otomatis (I1)
- [ ] Verifikasi email/WA sebelum akun aktif (I2) — sesuai keputusan provider
- [ ] Staf baru `pending_approval` sampai Owner approve (I3)
- [ ] Lockout & rate limit login tetap berfungsi (regresi)
- [ ] Member auth (PIN + JWT) tidak berubah tanpa izin (design contract #12)

## D. Integritas finansial (regresi wajib setiap batch yang menyentuh uang)
- [ ] `cash_ledger_entries` tetap immutable (trigger), koreksi = reversal
- [ ] Tidak ada tulis langsung `cash_sessions.expected_cash` (hanya `postDrawerCash`)
- [ ] `cashLedgerFingerprint` identik sebelum/sesudah migration di staging
- [ ] `closing-audit-probe.integration.test.ts` dan suite `cash-*` hijau
- [ ] Verifier ≠ pembuat (closing, petty, setoran, opname) tidak dilemahkan
- [ ] Data historis (order, ledger, harga, resep, stok) tidak di-UPDATE/DELETE oleh migration
