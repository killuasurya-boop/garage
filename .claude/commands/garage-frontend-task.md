---
description: Implement a scoped Garage frontend-only task
argument-hint: [task]
---

Implement this Garage Coffee & Motor frontend task:

$ARGUMENTS

Mandatory project rules:
- Frontend-only mock data. Do not add backend, API routes, database, auth, persistence, server actions, or external integrations.
- Read relevant files before editing.
- Keep changes scoped to the task.
- Preserve the existing Next.js App Router, TypeScript, Tailwind v4, shadcn/ui, and lucide-react patterns.
- Do not modify PRD files, PDFs, ZIPs, or source design assets unless explicitly requested.
- Preserve Garage theme: black asphalt, chrome/silver, red accent, amber highlights, dense ops dashboard.
- Protect desktop and mobile layouts from text overflow.

Main files:
- `src/components/garage/garage-app.tsx`
- `src/lib/garage-data.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`

After editing:
- Run `npm run lint`.
- Run `npm run build`.
- Browser-check `http://127.0.0.1:3000/`.
- Verify desktop around `1366x900` and mobile around `390x844`.
- Confirm no console errors and no clipped controls.

Final response should summarize:
- what changed
- files touched
- verification results
- any remaining risk or follow-up
