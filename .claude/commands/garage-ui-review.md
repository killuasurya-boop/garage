---
description: Review Garage UI/UX without editing by default
argument-hint: [area or concern]
---

Review the Garage Coffee & Motor frontend UI/UX.

Focus: $ARGUMENTS

Default mode is review-only. Do not edit files unless explicitly asked after the review.

Prioritize findings in this order:
- broken or risky behavior
- mobile/tablet overflow
- unreadable logo or text
- clipped money, totals, inventory numbers, badges, buttons, or table cells
- unclear POS cashier workflow
- weak contrast or off-brand color usage
- inconsistent Garage theme usage

Garage design rules:
- dark asphalt base
- chrome/silver text
- red primary accent
- amber operational highlights
- dense operational layout, not landing-page style
- no decorative blobs or marketing hero sections

Output format:
- Findings first, ordered by severity.
- Include affected file or UI area.
- Include exact reproduction notes where possible.
- Keep summary short.
- If no issues are found, state that clearly and list residual test gaps.

Useful checks:
- desktop around `1366x900`
- mobile around `390x844`
- POS category/filter/cart behavior
- Inventory search/filter/table behavior
- header shift context and logo readability
- console errors
