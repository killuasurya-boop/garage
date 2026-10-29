# 02 — Architecture decisions (ADR) atas repo nyata

Status: `ADOPT` = dipakai · `ADOPT-PARTIAL` = sebagian sudah ada, sisanya dikerjakan · `OPEN` = butuh keputusan/uji · `PROPOSED` = usulan.

| ADR | Keputusan blueprint | Kondisi repo | Keputusan | Status |
|---|---|---|---|---|
| ADR-001 | Satu policy/action backend untuk ChatGPT & in-app | Mesin tool (`agent-tool-core.ts`, `agent-tools*.ts`, `mcp-confirmation.ts`) dipakai ChatGPT + agent API; Aya in-app memakai mesin lain (`/api/ai/pos-agent`, `ai_action_drafts`) | Owner AI Command Center in-app memanggil **mesin tool yang sama** (`runAgentTool` + alur preview/token/konfirmasi yang sama, sumber `garage_owner_ui`). Draft Aya lama tetap untuk saran/alert non-bisnis. | ADOPT-PARTIAL |
| ADR-002 | MCP Gateway terisolasi dari POS | MCP berjalan di proses Next.js `app` yang sama | Phase 1 tetap in-process (tanpa ubah infra produksi) + batas: rate limit per klien, timeout tool, kill switch. Isolasi container (`mcp` service + route Caddy) = rencana terpisah, butuh izin Owner (ubah docker-compose/Caddy produksi). | OPEN (Owner) |
| ADR-003 | Tanpa raw SQL/root | `R4_FORBIDDEN`, `ubahDataBlockReason`, tool hanya lewat `/api/*` bertipe | Dipertahankan; tes negatif ditambah tiap tool baru | ADOPT |
| ADR-004 | Koreksi keuangan = reversal/adjustment | Buku kas append-only (trigger), `reverses_id`, petty reversal | Dipertahankan; tool koreksi keuangan memanggil jalur reversal yang ada | ADOPT |
| ADR-005 | Harga reguler ≠ event | `event_menu_entries` terpisah, bundle FINAL | Dipertahankan; tool harga wajib menyebut scope `regular` | ADOPT |
| ADR-006 | Fraud = anomali + bukti, bukan tuduhan | `risk-rules.ts` (tes melarang kata menuduh), disposisi manusia | Dipertahankan | ADOPT |
| ADR-007 | Write MCP eksternal tergantung kapabilitas ChatGPT | Saklar `mcpChatgptWriteEnabled`; belum ada deteksi kapabilitas | Status Tool Access = `UNKNOWN` sampai tool tulis benar-benar sukses dari ChatGPT (receipt), lalu `READ_WRITE`; jalur in-app sebagai fallback | ADOPT |
| ADR-008 | Versi SDK/protokol dipin setelah uji | JSON-RPC sendiri, `2025-06-18` | Tidak menambah SDK sekarang (menghindari perubahan protokol tanpa uji host). Revisi setelah uji ChatGPT nyata. | OPEN |
| ADR-009 | IdP/OAuth, host, tunnel | Better Auth MCP di `garagecoffee.id/api/auth`, resource `/api/mcp/chatgpt` | Pakai yang ada; URL MCP yang ditampilkan Connection Center = `https://garagecoffee.id/api/mcp/chatgpt` (bukan `mcp.` subdomain yang belum ada) | ADOPT (subdomain = OPEN) |
| ADR-010 | Basis akuntansi, costing, refund | Purchase-basis COGS, moving average, refund lewat workflow | Tidak diubah oleh proyek ini | ADOPT (existing) |
| ADR-011 | RPO/RTO & staging | Backup harian + pre-deploy, offsite terenkripsi, drill lulus; staging menunggu DNS | Write AI baru di produksi baru diaktifkan setelah staging/restore drill (gate §14.2) | OPEN (DNS) |
| ADR-012 | Akun Google resmi, scope, folder | Drive OAuth per Owner ada | Gmail ditunda sampai Owner memilih akun & scope | OPEN (Owner) |
| ADR-013 | Verifikasi koneksi ChatGPT | Belum ada | Kode sekali pakai 8 karakter dibuat di AI Connect (hanya hash disimpan, TTL 10 menit, maks 5 percobaan, terikat Owner pembuat); tool `garage_verify_connection` hanya sukses bila token OAuth milik Owner yang sama → catat `ai_connections.last_verified_at` + receipt. Status `VERIFIED` kedaluwarsa menjadi `NEEDS_REVERIFY` setelah TTL kebijakan (default 24 jam). | PROPOSED |
| ADR-014 | Receipt operasi | `mcp_operations` tanpa hash | Tambah kolom additive `before_hash`/`after_hash`/`request_id`/`source` + tool `garage_get_operation`; audit hash-chain di `ai_audit_events` (append-only trigger seperti buku kas) | PROPOSED |
