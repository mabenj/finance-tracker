---
title: Carried amount stamping and "ed. kk" ghost hint
labels: [ready-for-agent]
status: open
blocked-by: [001-tri-state-recurrence.md]
---

# Carried amount stamping and "ed. kk" ghost hint

## Parent

PRD: [Recurrence kinds — fixed and variable carry-forward](../prd/recurrence-kinds.md)

## What to build

Stamp every carried expense and income with its **carried amount** — the amount it had in the previous snapshot at carry-forward time — and show it as a muted "ed. kk" ghost hint on variable rows, so the user can judge mid-month whether they're on pace.

End-to-end behavior: after creating July from June, the July groceries row (variable, €0) shows a muted `ed. kk 740,00 €` beside its current figure. The hint stays visible all month — in view mode, in the edit form, and during ± quick-adjust — no matter how the amount grows. Items created by hand within the month show no hint. Renaming, recategorizing, editing the amount, or changing the kind never alters the hint; it always means "what this was last month".

Scope:

- **Schema**: one new numbered migration adding a nullable integer `carried_amount` (EUR cents) to both tables.
- **Carry-forward**: stamp `carried_amount` with the source amount on every carried row, uniformly for fixed and variable (keeps the copy unconditional); hand-created rows keep it null.
- **API**: `carried_amount` is server-managed and read-only to the client — upsert never accepts it and updates never touch it, so it survives edits, category moves, and kind changes. Reads return it.
- **UI**: variable rows with a non-null carried amount render the muted `ed. kk` figure beside the current amount (both expense and income rows). Fixed and one-off rows never show it. No green/red coloring on the hint (redesign rule: color only on real figures). Finnish copy in the central strings module.
- **Import script**: leaves `carried_amount` null; no historical backfill.
- **ADR**: record the stamped-at-carry-time vs computed-at-read-time decision per the PRD's Further Notes.

## Acceptance criteria

- [ ] Carry-forward stamps `carried_amount` = source amount on every carried expense and income, fixed and variable alike
- [ ] Hand-created items have a null carried amount and show no hint
- [ ] Upsert rejects or ignores any client-supplied carried amount; updates (rename, amount, category move, kind change) leave the stored value untouched
- [ ] Variable rows with a carried amount show the muted `ed. kk` figure in view mode, edit mode, and during ± quick-adjust
- [ ] Fixed and one-off rows never show the hint, even when a carried amount is stored (e.g. after a fixed→variable→fixed round trip the hint appears/disappears with the kind)
- [ ] The hint uses muted ink only — no green/red
- [ ] ADR for the stamped carried-amount decision exists under the ADR directory
- [ ] Tests added at the tRPC caller seam (read-only contract, outputs) and carry-forward service seam (stamping, null for hand-created); full suite passes

## Blocked by

- [001 — Tri-state recurrence for expenses and incomes](001-tri-state-recurrence.md)
