# Smart Approval V3 — 02 Blueprint Arsitektur

```
Pengajuan (POS/Finance/WMS)  ──►  approvals (status keputusan + execution_status + outlet + nominal angka)
        │                                  │
        ▼                                  ▼
 Owner Decision Center ──GET──► decision-center-server.getDecisionDetail
   (/control/decision)            ├─ approvalSubjectSnapshot (order/shift/biaya) → sidik SHA-256
                                  ├─ explainApproval (murni, aturan) → A–J
                                  ├─ audit_logs (timeline)
                                  └─ R3: createStepUpChallenge(subject=id, hash=sidik)
        │ POST (approve/reject/defer/request_revision/ask)
        ▼
 decideFromDecisionCenter ── R3: consumeStepUpChallenge (TOTP, sekali pakai, hash harus sama)
        └─► decideApproval (jalur resmi yang sama dengan board/PIN)
              ├─ cek outlet (Manajer) + sidik (STALE 409)
              ├─ klaim atomik pending→approved/rejected, execution_status=running
              ├─ applyApprovalDecision (void/refund/PCX/kas/biaya/opname; langkah idempoten)
              ├─ sukses → succeeded/not_required + executed_at
              └─ gagal  → kembali pending + failed + alasan aman + audit
```

- Modul murni (bisa dipakai client): `src/lib/smart-approval.ts` (tier R1–R3, gerbang bulk/auto, cakupan outlet),
  `src/lib/decision-center.ts` (penjelasan A–J, prioritas).
- Server: `smart-approval-snapshot.ts`, `decision-center-server.ts`, `garage-service.ts` (`decideApproval`, `reviewApproval`,
  `decideApprovalsBulk`, `runAutoApprovalSweep`).
- Dependensi baru: **tidak ada**. XState/pg-boss/xyflow/casbin dievaluasi — tidak dibutuhkan sekarang: transisi status
  sederhana dan dijaga oleh `UPDATE … WHERE status='pending'`; tidak ada antrean background yang perlu retry; izin cukup
  dengan `role-access` + cakupan outlet. Dicatat ulang bila workflow builder visual/aturan izin kompleks diminta.
