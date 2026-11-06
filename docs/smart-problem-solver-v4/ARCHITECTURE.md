# AYA Smart Problem Solver V4 — Arsitektur

```
Owner (UI /control/aya-solver | MCP garage_analisis_masalah)
  └─► POST /api/ai/problem-solver (Owner-only, rate limit, audit dulu)
        └─► runGarageProblemSolver
              ├─ selectProblemProbes (rute domain dari teks; daftar putih tool R0)
              ├─ evidence collector deterministik: runAgentTool (izin sesi Owner), 3 paralel, timeout 8 dtk
              ├─ extractFacts (angka/ID/SKU) → testHypotheses (didukung/lemah/tidak/belum diuji)
              ├─ buildProblemDiagnosis → laporan wajib + opsi + rekomendasi (eksekusi BELUM_DILAKUKAN)
              └─ decision explainer (opsional): runGarageAiAgent dengan konteks whitelist (aiSafeExcerpt)
        └─► createProblemCase → ai_problem_cases + event "analysis"
Keputusan → event "decision" (sidik diagnosis, STALE) · Pelaksanaan → AI Command Center / modul resmi
(runToolWithConfirmation) lalu event "action_linked" (operasi milik Owner, status dari DB) · Verifikasi → event
"verification" (ukur ulang R0, bandingkan metrik).
```

Pemisahan peran (tanpa agen ganda): evidence collector, hypothesis tester, decision explainer, action planner (opsi draf),
approval gate (Owner + `runToolWithConfirmation`), executor resmi (tool yang sudah ada), outcome verifier (`compareOutcome`).
Agen GARAGE AI yang ada (supervisor, finance guard, approval, SOP, daily brief) tidak digandakan; provider AI = `garage-ai-providers`.

Evaluasi dependensi (tidak dipasang): MCP TypeScript SDK (gateway sendiri sudah ada & teruji), LangGraph/Mastra (orkestrasi
saat ini linear & deterministik), XState (status sederhana), pg-boss (tidak ada job background baru), Langfuse/promptfoo
(dataset evaluasi dijalankan di Vitest; pertimbangkan bila prompt AI diperluas). Semua menambah dependensi/servis di VPS
tanpa kebutuhan terukur saat ini.
