# Gap Analysis — PRD V4.0 vs kode existing

Detail per fitur (F01–F55, status ✅/🟡/❌, bukti file, batch) ada di **`07-TRACEABILITY-F01-F55.md`**.
File ini merangkum per pilar dan mencatat konflik.

## Ringkasan per pilar (hitungan dari 07)

| Pilar | ✅ | 🟡 | ❌ | Catatan utama |
|---|---|---|---|---|
| Keuangan F01–F40 | 6 | 25 | 9 | Ledger tunggal, petty, setoran, closing pecahan sudah kuat. Belum: Open Shift policy, parkir, LV1–LV5, rekap bulanan, PDF 360, Owner final + TOTP |
| Identitas F41–F47 | 0 | 0 | 7 | Seluruhnya baru (Google OAuth, email/WA OTP, staff application, Access Approval Center) |
| MCP/AI F48–F53 | 0 | 6 | 0 | MCP & AI internal ada; OAuth, registry, preview/receipt, Gmail belum |
| UX F54–F55 | 0 | 2 | 0 | Design system staf ada; redesign + screen census belum |

## Konflik & status penyelesaian

| # | Konflik | Penyelesaian |
|---|---|---|
| K1 | PRD §22.5/§00.3: ChatGPT read-only, finance tidak via MCP — vs permintaan Owner full access | **D-01 FINAL: full access Owner** (R0–R3), R4 tetap ditolak. Lihat `06-OWNER-DECISIONS.md` |
| K2 | PRD §24.2 token light vs CLAUDE.md dark asphalt | **D-02 OPEN** |
| K3 | PRD §12 custody manajer/safe vs CLAUDE.md "setoran tanpa brankas, `brankas` retired" | **D-03 OPEN** |
| K4 | Email provider/Gmail dilarang default CLAUDE.md vs PRD §06.7/§20.4 | D-04: diminta PRD → diizinkan; butuh kredensial |
| K5 | Member design contract terkunci (CLAUDE.md) vs PRD §06.4 progress 4 tahap & tombol Google | Ikuti kontrak member: tambah komponen lewat `member-auth/` & `--gm-*` tokens; tombol Google baru muncul setelah provider nyata dikonfigurasi (aturan #13) |
| K6 | Auto-deploy `main` vs "jangan deploy tanpa izin" | Merge hanya oleh Owner; usulkan required reviewer environment `production` |
| K7 | PRD §03.1 menyebut endpoint close cukup `shift:cash` | Benar di kode (`requireAnyPermission(["finance:write","shift:cash"])`) → B4 memisah submit vs final |
