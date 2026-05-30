---
description: Run Garage lint/build verification
argument-hint: [optional focus]
---

Verify the Garage Coffee & Motor frontend.

Focus: $ARGUMENTS

Run or request these checks:

```bash
npm run lint
npm run build
```

If a command fails:
- Quote the exact failing file, line, and error.
- Explain the likely cause briefly.
- Propose the smallest safe fix.
- Do not hide unrelated failures.

If commands pass:
- State that lint and build pass.
- Recommend browser checks:
  - `http://127.0.0.1:3000/`
  - desktop around `1366x900`
  - mobile around `390x844`
  - Dashboard, POS, Kitchen, Inventory, Finance, CRM, Approvals, Audit render
  - console errors are `0`

Remember:
- This is a frontend-only mock app.
- Do not introduce backend, API routes, database, auth, or persistence while fixing build issues.
