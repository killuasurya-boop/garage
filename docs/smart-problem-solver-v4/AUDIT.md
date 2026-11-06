# AYA Smart Problem Solver V4 — Audit PR #176

PR #176 (`feat/aya-problem-solver-v4-preview`, 7 commit) digabung ke branch kerja tanpa konflik terhadap `main`
(`bec5f34`). 5 tes bawaan lulus. Status: pratinjau baca-saja, belum di-deploy.

## Yang sudah benar
- Probe hanya dari daftar putih tool R0; 19 nama tool sudah dicek ADA di registry (`agent-tools*.ts`).
- Owner-only di route (`requireGarageSession(["Owner"])`) dan di tool MCP `garage_analisis_masalah` (R0, `domain: sistem`).
- Semua usulan tindakan `draft_only`, `ownerDecision = NOT_DECIDED`, `executionStatus = NOT_EXECUTED`.
- Sumber gagal → `NEED_REVIEW`, tanpa sumber → `DATA_UNAVAILABLE` (tidak mengarang fakta).

## Temuan
| # | Prioritas | Temuan | Lokasi | Rencana |
|---|---|---|---|---|
| B1 | P0 | Pesan error tool diteruskan mentah ke hasil & konteks provider AI (bisa berisi teks SQL) — melanggar aturan MCP hardening | `investigateProblem` (`error.message`) | Batch 2: kode error aman + ref, detail hanya di log |
| B2 | P1 | `setTimeout` batas 8 dtk tidak dibersihkan; rate limit in-memory; "fakta" generik untuk sebagian besar tool | `investigateProblem`, `summarizeFacts` | Batch 2: AbortSignal/cleanup, fakta angka per tool |
| B3 | P1 | Redaksi PII berbasis pola nama kunci (blacklist); perlu daftar putih field sebelum ke provider eksternal | `safeExcerpt` | Batch 2: whitelist (angka, ID, status, periode) — keputusan Owner 6 Nov |
| B4 | P1 | `import "server-only"` di service membuat modul tak bisa diuji di Vitest | `garage-problem-solver-service.ts` | Batch 2 |
| B5 | P2 | `checkedAt` ≠ waktu data; banyak tool tidak mengembalikan `dataAsOf` | evidence | Batch 2: label "waktu data tidak tersedia" |
| B6 | P2 | Kuota hasil tool (mis. 30/60 baris) bisa terpotong tanpa tanda | probe args | Batch 2: `truncated` + catatan keterbatasan |
