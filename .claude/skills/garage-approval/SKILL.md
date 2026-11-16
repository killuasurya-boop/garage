---
name: garage-approval
description: Aturan WAJIB Smart Approval V3 (tier, eksekusi, Decision Center, Document Approval, AI Governance, kebijakan keputusan, expiry/reconcile). Muat sebelum mengubah approvals atau Decision Center.
---

# garage-approval

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

- Smart Approval V3 (owner, Nov 2026, migration 0177, `docs/smart-approval-v3/`): `approvals` carries `outlet_id`,
  `amount_value`, `execution_status` (decision ≠ execution: running/succeeded/failed/not_required/legacy), error/attempts,
  `decision_snapshot_hash`, `review_state` (Tunda/Minta revisi, status stays pending). Rules pure in `src/lib/smart-approval.ts`
  (tier R1–R3, `bulkDecisionBlockReason`, `autoApprovalDecision`, `canDecideForOutlet`). `decideApproval` checks outlet, optional
  `expectedSnapshotHash` (`approvalSubjectSnapshot`, 409 STALE), records failed execution (back to pending + audit), PCX split is
  idempotent (`payload.splitChildId`). Bulk approve never touches R3/void/refund/cash/stock; auto-approval = expense, low/medium,
  < threshold, requester ≠ sweeper, max 3/day/requester. Owner Decision Center `/control/decision` (`decision-center*.ts`,
  `/api/control/decision-center`): explanation A–J is rule-based; R3 = Owner TOTP step-up bound to the snapshot hash.
- Smart Approval Batch 7 (Nov 2026, migration 0179, `docs/smart-approval-v3/09-BATCH7.md`):
  - Document Approval: a new company document version = `review_status` pending + sha256 + approval `APP-DOC-<versionId>` (one tx);
    effective version = `company_documents.approved_version` (set only when approved; rejected keeps the old one, file kept).
    `ownerOnlyApproval` (`smart-approval.ts`): APP-DOC hidden from and undecidable by non-Owner. Snapshot hash covers doc/version.
  - A8: APP-PCX `payload.requestedBy` = user id (name in `requestedByName`); self-approval check also matches legacy "Nama / Peran".
  - AI Governance `/control/ai-governance` (`ai-governance.ts` pure, `-server.ts`, Owner screen only): mode = the two existing
    switches (`settingsForMode`; paused also turns writes off), tool risk from the code registry (read-only). `mcpChatgpt*` and
    `securityRequire2faForOwner` are Owner-only (`assertRoleMayWriteSettings`); `ubah_data_garage` refuses protected setting keys.
  - Decision PDF `GET /api/control/decision-center/[id]/pdf` (`decision-pdf.ts`): DRAFT until decided AND execution recorded;
    printing never creates a step-up challenge (`getDecisionDetail(..., { stepUp: false })`).
- Smart Approval decision policy (audit Nov 2026, `docs/smart-approval-v3/10-AUDIT-FIXES.md`): ONE rule set in
  `decisionPolicyBlock` (`smart-approval.ts`), called inside `decideApproval` for every channel (board, pin, langsung, auto,
  decision_center, chatgpt, owner_command, agent_key). Agent API keys never decide/defer (`AGENT_CANNOT_DECIDE`). Approving R3 =
  Owner + 2FA verified for that decision (`stepUpVerified`, set only by Decision Center after TOTP or by the MCP R3 confirm flow);
  rejecting is always allowed. Non-Owner "langsung" on high risk stays pending (`canSelfApprove(garage, risk)`). `putuskan_approval`
  is R3. APP-CASH: opener/closer can't approve own discrepancy; an existing sign-off is never overwritten.
  Tahap B (migration 0180): `approvals.expires_at` (discount 6 h, `APPROVAL_TTL_HOURS`), statuses `expired`/`superseded`
  (never deleted); `reconcileApprovals` (`approval-reconcile.ts`, rules pure in `-rules.ts`, every minute from the server
  sweeper) expires/supersedes, verifies stuck `running` executions (succeeded only with proof, else `uncertain`) and pushes
  R3 / R2>30 min to Owners. Sweep skips `reviewState`; errors never carry SQL (`safeExecutionError`).
  Tahap C/D: Decision Center loads deterministic cross-module context (requester 30 days, open risk alerts, same order) +
  evidence-completeness `confidence`; `getDecisionQueues` = read-only index of other modules' approval queues; decisions
  record `payload.decisionCenter` (recommendation, confidence, followed) → AI Governance "Kualitas keputusan".
