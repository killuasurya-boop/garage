# Security Checklist — Garage OS Master 2026

Centang hanya bila sudah diverifikasi dengan test/bukti. Referensi temuan: `01-AUDIT-PHASE0.md`.

## A. VPS / GitHub / deploy (agent tidak boleh mengubah — hanya verifikasi & usulan)
- [ ] Branch protection `main`: wajib PR, wajib CI hijau, larang force push & delete (Owner)
- [ ] Environment `production` punya required reviewer = Owner (Owner)
- [ ] Registrasi workflow WMS yatim dinonaktifkan (Owner, F-09)
- [ ] Tidak ada secret di repo (`.env*` di-gitignore; jalankan secret scanning sebelum PR)
- [ ] Setiap migration baru additive & reversible-by-forward; diuji PGlite + staging
- [ ] Rencana: deploy user non-root (F-11) — usulan, butuh izin Owner
- [x] Push ke branch `claude/*` tidak memicu deploy (diverifikasi dari `ci.yml`/`deploy.yml`)

## B. MCP / agent AI
- [ ] `garage_api` memakai allowlist per scope, bukan denylist (F-01)
- [ ] Agent tidak bisa: ubah settings keamanan, user/role, 2FA, sertifikasi saldo, approve apa pun (F-01/F-02)
- [ ] Aksi uang/identitas dari agent = draft + preview + approval manusia (M2)
- [ ] Audit agent sinkron, gagal audit = request gagal; GET data finansial diaudit (F-05)
- [ ] Rate limit agent persisten lintas restart (F-06)
- [ ] Prompt-injection: output tool tidak dieksekusi sebagai instruksi; deskripsi tool tanpa data user
- [ ] Test: tiap route sensitif menolak sesi agent (403 `HUMAN_SESSION_REQUIRED`)

## C. Identitas
- [ ] 2FA wajib Owner/Manajer ditegakkan di API, bukan hanya halaman (F-04)
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
