# AYA Smart Problem Solver V4 — Operasional

- Owner: `/control/aya-solver` (tulis masalah → Quick Scan/Full), `/control/decision` (putuskan pengajuan),
  `/control/intelligence` (pantau jaringan modul). ChatGPT MCP: `garage_analisis_masalah`.
- Provider AI mati/tidak dikonfigurasi → analisis berbasis aturan tetap jalan (`rule_based_fallback`).
- Beban: maks 6 sumber (quick)/15 (full), 3 paralel, 8 dtk per sumber; rate limit 8/menit (solver), 20/menit (kasus),
  30/menit (Decision Center). Living Intelligence polling 30 dtk, berhenti saat tab tersembunyi.
- Kegagalan sumber muncul sebagai "Sumber gagal dibaca (ref XXXXXX)" — cari ref di log server.
- R3 di Decision Center butuh 2FA aktif di akun Owner (Control → 2FA).
