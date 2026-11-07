# Garage OS — AYA Intelligence Smart Problem Solver V4

**Status: READ-ONLY PREVIEW / review PR, NOT deployed to production.**

## Owner Goal

Owner can submit a complaint, idea, request, anomaly, policy question or proposed change. AYA should explain:
1. What is the problem?
2. Which real sources were read, at what time and in what scope?
3. What is VERIFIED versus a HYPOTHESIS?
4. What evidence is missing?
5. What is the safest recommended next action, with reasons and risks?
6. What changes would happen if a later approved action is run?
7. What is the actual result, only after the execution receipt and read-after-write check?

Do not pretend a problem is solved merely because the agent recommended an action.

## Existing Garage Foundation (reuse, do not replace)

- src/lib/agent-tools.ts: one MCP/AgentTool catalog with Zod, permission and risk metadata.
- src/lib/mcp-chatgpt-gateway.ts: authenticated Owner OAuth, audit and confirmation.
- src/lib/mcp-confirmation.ts: existing R2/R3 approval execution gate.
- src/lib/garage-ai-agents.ts: supervisor, finance guard, approval, inventory, POS, kitchen, SOP agents.
- src/lib/garage-ai-providers.ts: existing OpenAI/Gemini/etc provider integration.
- src/lib/approval-rules.ts and cash-final-approval.ts: existing finance workflows.

## Files Introduced

- src/lib/garage-problem-solver.ts: rule-based probe planner, sanitized evidence summary, fact/hypothesis separation, draft-only action proposals.
- src/lib/garage-problem-solver-service.ts: invokes R0 existing tools under current Owner permissions; optionally uses existing configured AI provider to explain evidence.
- src/app/api/ai/problem-solver/route.ts: Owner-only POST, validation, rate limit, fail-closed audit, no-store.
- src/lib/garage-problem-solver.test.ts: unit tests for domain routing, no writes, privacy and failure fallback.
- src/lib/agent-tools-owner-ai.ts: MCP tool garage_analisis_masalah (Owner-only R0).
- .claude/skills/garage-problem-solver/SKILL.md: reusable Claude Code development skill.

## API Contract

POST /api/ai/problem-solver

Request:
~~~json
{ "message": "Selisih QRIS dan cash kasir, analisa penyebab", "mode": "quick", "withAi": true }
~~~

Response: existing Garage API envelope with
- diagnosis.version = 4.0-preview
- diagnosis.evidence[] (source tool, available/unavailable, checkedAt, dataAsOf if present, bounded excerpt)
- diagnosis.analysis (verifiedFacts, hypotheses, missingEvidence, confidence, recommendation, risks)
- diagnosis.proposedActions[] (draft_only, risk R0–R3, never executed)
- diagnosis.ownerDecision = NOT_DECIDED
- diagnosis.executionStatus = NOT_EXECUTED
- ai.status = suggestion_only or unavailable; text is not official approval.

For ChatGPT / Agent MCP:
garage_analisis_masalah({ masalah: "...", mode: "quick" | "full", gunakanAi: true })

## Architecture

Owner input
-> authenticated Owner-only route or MCP tool
-> domain selection (bounded R0 allowlist)
-> existing AgentTool registry + permission checks
-> sanitized evidence and missing source tracking
-> hypotheses / verified facts / recommendation draft
-> optional existing AI provider explanation
-> decision card
-> NO write/action/approval.

Next phase (requires separate implementation review):
Draft action -> existing runToolWithConfirmation -> Owner review/step-up -> official service effect
-> operation receipt -> independent re-read -> outcome verification -> append-only history.

## Quality and risk gates

P0:
- Run TypeScript, ESLint, Vitest, Playwright in actual Garage repo.
- Verify every chosen R0 tool signature and permission.
- Verify dataAsOf: checkedAt is NOT the business event time.
- Confirm no private customer/staff data is sent to external provider unintentionally.
- Verify rate limits and query load on production-like data.
- Test prompt injection in request and DB/tool output.
- Test errors, stale data, zero data, partial data, concurrent calls and malformed responses.
- Validate cross-outlet scoping; Owner is the only role allowed to invoke this feature.
- Test no effects on POS/Finance/WMS/Final Closing; keep the old approval path intact.

P1:
- Add persistent cases/evidence/hypotheses/decisions/outcomes tables with append-only history.
- Add specific drill-down/correlation across orderId, shiftId, SKU, stock movement, supplier, station.
- Add outcome verification using official operationId and read-after-write.
- Add mobile-first UI: Masalah, Fakta, Dugaan, Bukti, Dampak, Pilihan Owner, Pelaksanaan, Hasil.
- Add multi-model evaluation based on costs and privacy constraints.
- Add idempotent alerts and scheduled monitoring with infrastructure-aware queue.

Never deploy, merge, run migrations, or mutate production business data without an explicit separate approval.
