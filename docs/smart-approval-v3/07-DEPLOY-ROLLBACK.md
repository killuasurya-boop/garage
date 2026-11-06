# Smart Approval V3 — 07 Rencana Deploy & Rollback

1. Owner menyetujui batch → merge PR ke `main` (deploy otomatis: migrasi 0177 + 0178 jalan saat start).
2. Sebelum merge: backup DB terbaru terverifikasi (`scripts/restore-drill.sh`), `release-check` hijau di main hasil merge.
3. Uji di staging dulu bila Owner memilih (`scripts/deploy-staging.sh <branch>`).
4. Setelah deploy: buka `/control/decision`, `/control/aya-solver`, `/control/intelligence`; cek satu pengajuan uji ditolak.

Rollback: revert merge commit lalu deploy. Kolom/tabel baru aditif — kode lama mengabaikannya (aman dibiarkan). Bila perlu
hapus: `DROP TABLE ai_problem_case_events, ai_problem_cases;` dan `ALTER TABLE approvals DROP COLUMN …` (hanya setelah backup;
keputusan & audit lama tidak tersentuh).
