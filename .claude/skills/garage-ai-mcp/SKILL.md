---
name: garage-ai-mcp
description: Aturan WAJIB MCP ChatGPT, Owner AI Connect/Command Center, tool registry & konfirmasi R0-R3, hardening MCP, AYA Problem Solver. Muat sebelum mengubah apa pun di /api/mcp, owner-ai, tool agen, atau AYA.
---

# garage-ai-mcp

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

- MCP ChatGPT (owner D-01, batch M0): OAuth 2.1 via `@better-auth/mcp` + `jwt` plugin, only when
  `GARAGE_MCP_CHATGPT_ENABLED=true` and `BETTER_AUTH_URL` is HTTPS (`resolveMcpChatgptConfig`, `mcp-chatgpt-config.ts`);
  off = no OAuth endpoints. Tables `jwks`/`oauth_*` (migration 0163) come from the drizzle-adapter schema generator — keep
  them in sync with the plugin version. `/api/mcp/chatgpt` = `requireMcpAuth` → `handleMcpChatgptRequest`
  (`mcp-chatgpt-gateway.ts`): kill switch `mcpChatgptPaused`, Owner + 2FA only (`mcpChatgptAccess`, also used by
  `/oauth/consent`), synchronous audit before each tool. Owner universal write (Okt 2026): `ubah_data_garage`
  (R2, `confirmOnly` = ChatGPT confirmation flow only; money paths `isMoneyPath` → R3 via `riskFor` = `kode2fa` required,
  Owner 28 Okt; encoded `%2e`/`%2f` paths rejected) + `garage_api` GET + `katalog_endpoint`
  (`api-route-catalog.generated.ts`, regenerate with `npx tsx scripts/generate-api-catalog.ts`) call `/api/*` via a
  temporary agent key revoked right after (`mcp-delegated-api.ts`; scope owner/readonly, hidden from key list);
  blocked paths in `ubahDataBlockReason`; switch `mcpChatgptWriteEnabled` (off = writes `MCP_WRITE_DISABLED`). Login/2FA pages forward the signed
  `oauth_query` (`oauth-login-continue.ts`). See `docs/AGENT-API.md` §6.
- Foto dari ChatGPT (owner 17 Nov 2026, no migration, `agent-tools-foto.ts` + `mcp-photo-staging.ts`): two tools, Owner via the
  confirm flow only (`confirmOnly`, agent keys refused). `siapkan_foto` (R1, `_meta["openai/fileParams"]=["foto"]` via `AgentTool.meta`)
  downloads the file the Owner uploaded in chat: https + OpenAI host allowlist only (`photoSourceBlockReason`, extra hosts via
  `GARAGE_MCP_PHOTO_HOSTS`), no IPs, redirects re-checked per hop, 8 MB stream cap, 15 s; content must decode as JPG/PNG/WebP and is
  re-encoded to WebP (EXIF stripped); staged in a NON-public temp dir bound to the Owner (30 min, max 10). `pasang_foto` (R2, preview +
  confirmation on stable `fotoId`) forwards the staged file as multipart (`callApiAsOwner` `form`) to an EXISTING upload route from a
  fixed list (`photoRoute`: produk_menu / produk_mitra — by `nama` via `resolveProductForPhoto` (Owner 18 Nov 2026: Garage AND
  partner products, not archived; a partner product found via produk_menu is routed to `/api/partners/products/<linkId>/image`;
  exact name wins, ambiguous = `PRODUK_AMBIGU`) —, bahan_gudang, hero_website, suasana_website slot 1–4,
  logo_sponsor / logo_talent (Owner 18 Nov 2026: by `nama`, `resolveEventLogoTarget`, not `batal`; stored DIRECTLY via
  `storeMenuImageBuffer` + `setSponsorLogo`/`setPerformerLogo` because those routes are Owner-human-only and refuse the delegated key)). Never add free paths or
  money evidence (receipts, transfer proofs, documents) to that list. Signed `download_url`s never reach audit (`toolArgsPreview`
  redacts to host), `mcp_operations` or error text.
- Owner AI Connect (blueprint GOS-AI-MCP V3 Phase 1, `docs/owner-ai/`, migration 0175): `/control/ai-connect` + navbar chip
  (`AiStatusChip`). Status is per dimension (`computeAiStatus`, `owner-ai-status.ts`, pure): gateway / identity / ChatGPT link / tool
  access / execution — never a single green. `VERIFIED` only via MCP tool `garage_verify_connection` with a one-time code from
  `POST /api/owner-ai/connection/challenge` (hash bound to Owner, 10 min, 5 tries) within a 24 h TTL; `READ_WRITE` only after a write
  actually succeeded from ChatGPT (previews don't count). Gateway records `ai_connections` per OAuth client and rejects tokens with
  `iat` ≤ `revoked_at` (JWTs are stateless). Revoke = Owner + TOTP (`/api/owner-ai/connections/revoke`), also revokes refresh tokens.
  `/api/owner-ai/*` is in `isAgentForbiddenPath` and rejects agent-key sessions: AI must never mint its own verification code.
- Owner AI Command Center (Phase 2, ADR-001): `/control/ai-command` runs agent tools on the SAME engine as ChatGPT
  (`owner-ai-commands.ts` → `runToolWithConfirmation` with `source: "garage_owner_ui"`, synchronous audit first). Never add a
  UI-only shortcut that skips preview/token/2FA. Receipts carry `sidikArgumen` + `sidikHasil` (`resultHash`, recomputable via
  `operationView`). Form = `SchemaForm` from the tool JSON schema (`parseIdNumber`: "2.5" stays 2.5).
- MCP hardening (owner-ai Phase 4): `tools/call` keeps the plain-text result but adds `structuredContent.dataAsOf` + `_meta`
  (`garage/requestId`, `garage/contentIsData`); errors = `toolFailure` (`code, message, requestId, retryable, recovery`) and NEVER forward
  unexpected error text (SQL/stack) — `EXECUTION_FAILED` + ref, details only in server logs. `mcp-load-guard.ts`: max 4 concurrent
  ChatGPT tool calls per Owner, read tools time out at 25 s, write tools are never cut. Fraud Watch tools `garage_list_anomaly_cases` /
  `garage_get_anomaly_case` wrap `listRiskAlerts` (same role scoping) and are read-only.
- MCP tool registry & confirmation (batches M1/M2): every agent tool declares `domain` (16 PRD domains) + `risk` R0–R3
  (`mcp-tool-registry.ts`, enforced by tests; `write === risk !== "R0"`). On `/api/mcp/chatgpt`, R2/R3 tools go through
  `runToolWithConfirmation` (`mcp-confirmation.ts`, table `mcp_operations`, migration 0164): first call = preview +
  single-use token (5 min, only nonce hash stored), confirmed call must repeat the exact args; claim is one atomic
  `UPDATE … WHERE status='pending'`. Never log the token. Tools may define a read-only `preview()`.
  R3 (D-01a): preview also creates a step-up challenge (subject = operation id, hash = args digest); the confirmed
  call needs `kode2fa` (Owner TOTP), verified BEFORE the token is claimed.

- AYA Problem Solver V4 (`docs/smart-problem-solver-v4/`, migration 0178): `garage-problem-solver.ts` (R0 whitelist, facts,
  hypotheses, report; tool errors never forwarded — ref only), service sends only `aiSafeExcerpt` to AI providers; MCP tool
  `garage_analisis_masalah` (R0, Owner). Cases `ai_problem_cases` + append-only `ai_problem_case_events` (`ai-problem-cases.ts`):
  analysis → decision (STALE) → link the Owner's own executed `mcp_operations` → verification (`compareOutcome`). UI
  `/control/aya-solver`; Living Intelligence `/control/intelligence` (16 registry domains, real signals, no signal = unverified).
- "Cukup nama" (Owner 18 Nov 2026, no migration; detail `docs/AGENT-API.md` §6): `agent-tools-produk-cepat.ts` (`buat_produk`,
  `ubah_harga_produk`), `agent-tools-mitra.ts` (daftar/produk/pesanan/usulan R0; tambah/setujui/ubah harga/putuskan usulan/status
  R2 — settlement & payout NEVER via chat), `agent-tools-event-lineup.ts` (`papan_event` R0; simpan talent/panitia/tugas R1 matched
  by name; `tempel_daftar_event` + `simpan_sponsor` R2, sponsor = agreement only, no ledger), `agent-tools-briefing.ts`
  (`briefing_pagi` R0 = existing read tools via `runAgentTool`, each section isolated). Tools resolve names server-side
  (exact wins, ambiguous = `*_AMBIGU` with choices), always call the SAME services as the screens (no new write path), partner
  data always from the session outlet. `toolFailure` forwards service business rejections (`domainRejection`: Error with
  `code` /^[A-Z][A-Z0-9_]+$/ + status 4xx + no SQL-looking text); everything else stays `EXECUTION_FAILED` + ref.
