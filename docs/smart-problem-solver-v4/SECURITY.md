# AYA Smart Problem Solver V4 & Smart Approval V3 — Keamanan

- Akses: Problem Solver, kasus, Decision Center, Living Intelligence = Owner saja; agent key ditolak untuk keputusan kasus
  (`/api/ai/problem-cases` di `isAgentForbiddenPath`) dan Decision Center (cek `agentKey`).
- Tidak ada tool tulis di investigasi (daftar putih + cek `write`/`risk` di layanan). Tidak ada SQL bebas/shell/secret.
- Prompt injection: output tool & teks pengguna = data; konteks AI hanya field daftar putih (angka/ID/status/periode),
  teks bebas & nama/kontak dibuang; tes eval memastikan instruksi tersisip tidak menjadi rekomendasi/aksi.
- Error: teks asli (SQL/stack) hanya di log server; hasil memuat pesan aman + ref. `execution_error` approval disaring.
- R3: TOTP Owner via `step-up-totp` (sekali pakai, 5 menit, terikat sidik data, kode tidak bisa dipakai ulang).
- STALE: keputusan approval & kasus menolak data yang berubah sejak dilihat.
- Linimasa kasus append-only (trigger DB). Audit log untuk keputusan, gagal pelaksanaan, tunda/revisi.
- Cakupan outlet: Manajer hanya outletnya (daftar, keputusan, auto-sweep, tool MCP `daftar_approval`).
- PII: laporan untuk Owner memakai `safeExcerpt` (nomor/email disamarkan, field sensitif dibuang).
- Retensi: kasus AYA boleh dihapus (cascade event) — kebijakan retensi otomatis belum dipasang (lihat ROADMAP).
