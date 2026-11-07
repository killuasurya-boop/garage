# Smart Approval V3 — 05 Struktur Database & Integrasi

Migrasi **0177_smart_approval_v3** (aditif, tanpa hapus data): kolom `approvals.outlet_id` (FK outlets), `amount_value`,
`execution_status` (default `not_required`), `execution_error`, `execution_attempts`, `executed_at`,
`decision_snapshot_hash`, `review_state`, `review_note`, `review_by`, `review_at`; indeks `(status, outlet_id)`.
Backfill: nominal dari label rupiah (kategori uang), outlet dari order/shift/biaya tertaut, keputusan lama = `legacy`.

Migrasi **0178_ai_problem_cases**: `ai_problem_cases` + `ai_problem_case_events` (trigger tolak UPDATE; DELETE untuk retensi).

Integrasi: POS (void/refund/batal item), Kas (selisih kas → sign-off), Finance (biaya), WMS (opname lama), MCP
(`daftar_approval` kini per outlet; `putuskan_approval` lewat `decideApproval` yang sama), audit_logs (keputusan, gagal
pelaksanaan, tunda/revisi). Tidak ada salinan data keuangan inti.
