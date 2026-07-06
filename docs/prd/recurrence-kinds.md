---
title: Recurrence kinds — fixed and variable carry-forward
labels: [ready-for-agent]
status: ready
---

# Recurrence kinds — fixed and variable carry-forward

## Problem Statement

Every recurring expense and income is carried forward into a new monthly snapshot with its previous amount. That fits genuinely static items (phone bill, subscriptions, salary), but for mostly dynamic items (groceries, alcohol, restaurants) last month's total is meaningless as a starting value — the user must remember to zero each one by hand at the start of every month, or the snapshot silently overstates spending until they do.

## Solution

Replace the boolean "recurring" notion with a three-kind **recurrence** property on every expense and income — *one-off*, *fixed*, *variable* (see the project glossary in CONTEXT.md):

- **One-off** items do not carry forward (unchanged behavior).
- **Fixed** items carry forward with their previous amount (unchanged behavior, new name).
- **Variable** items carry forward at €0 and are filled in as the month unfolds, typically via the existing ± quick-adjust.

At carry-forward time every carried item is stamped with its **carried amount** — the amount it had in the previous snapshot. Variable rows display this as a muted "ed. kk" ghost hint beside the current figure all month, doubling as an "am I on pace?" reference.

In the forms, the familiar "Toistuva" checkbox stays; checking it reveals an inline *Kiinteä | Muuttuva* pill pair (defaulting to Kiinteä). In list rows, fixed items keep the `↻` marker and variable items show `↻⁰`.

## User Stories

1. As the user, I want to mark an expense as variable, so that it starts at €0 in the next month's snapshot instead of last month's total.
2. As the user, I want to mark an expense as fixed, so that it carries forward with its previous amount exactly as recurring expenses do today.
3. As the user, I want to mark an income as fixed or variable, so that irregular income (freelance, bonuses) starts at €0 while salary carries its amount.
4. As the user, I want one-off expenses and incomes to keep not carrying forward at all, so that existing behavior is preserved.
5. As the user, I want the recurrence kind itself to carry forward, so that groceries marked variable once stay variable every month without re-marking.
6. As the user, I want a category whose only expenses are variable to survive carry-forward, so that my category tree stays intact even when its amounts reset to zero.
7. As the user, I want existing recurring items to become fixed automatically when the feature ships, so that nothing changes behind my back; I opt items into variable myself.
8. As the user, I want to see last month's amount as a muted hint on carried variable rows, so that I can judge mid-month whether I'm on pace.
9. As the user, I want the ghost hint to remain visible all month, including while the amount is nonzero and while I'm quick-adjusting, so that the reference never disappears when I need it.
10. As the user, I want hand-created items (not carried) to show no ghost hint, so that the hint always means "what this was last month".
11. As the user, I want to keep using the "Toistuva" checkbox I know, so that the new choice appears only when relevant.
12. As the user, I want the fixed/variable choice to appear inline next to the checkbox without the form jumping in height, so that editing stays fast in dense rows.
13. As the user, I want the sub-choice to default to Kiinteä when I check "Toistuva", so that the previous recurring behavior remains the path of least surprise.
14. As the user, I want the form to remember my pill choice if I uncheck and re-check "Toistuva" while the form is open, so that the form doesn't fight me.
15. As the user, I want the form to reflect the item's saved kind whenever I open it, so that what I see is what is stored.
16. As the user, I want fixed rows marked `↻` and variable rows marked `↻⁰` with explanatory tooltips, so that I can scan which items will reset next month.
17. As the user, I want to change an item's kind mid-month (e.g. fixed → variable), so that my classification can evolve; the stamped carried amount stays truthful either way.
18. As the user, I want a freshly carried €0 variable item to be invisible in the Sankey diagram, so that the diagram shows actual flows only.
19. As the user, I want to grow a variable expense through the month with the existing ± quick-adjust, so that each receipt is a simple `+12.50` fold.
20. As the user, I want the edit forms to save the chosen kind through the same save action as today, so that no new workflow is introduced.
21. As the user, I want validation to reject any recurrence value other than the three kinds, so that data stays coherent.
22. As the user, I want the carried amount to be unmodifiable from the client, so that the hint can never drift from what last month actually was.
23. As the user, I want my historical JSON import to keep working, mapping its recurring items to fixed, so that imported months are consistent with the new model.
24. As the user, I want all Finnish copy for the new controls and hints (Kiinteä, Muuttuva, ed. kk, tooltips) to live with the rest of the app's strings, so that the app stays Finnish-only and consistent.

## Implementation Decisions

- **Domain model (see CONTEXT.md glossary)**: *Recurrence* is a single tri-state property (`none` / `fixed` / `variable`) on both expenses and incomes — deliberately not a pair of booleans, so no illegal state (non-recurring-but-variable) can exist. *Carried amount* is a nullable, server-managed value stamped at carry-forward time.
- **Schema**: one new migration per the established numbered-migration pattern. Both the expenses and incomes tables: add a text `recurrence` column (NOT NULL, default `none`, CHECK-constrained to the three kinds), backfill `recurring=1 → fixed` and `0 → none`, drop the old `recurring` column, and add a nullable integer `carried_amount` (EUR cents). No back-compat shim — single-user app, client and server deploy together.
- **Carry-forward service**: copies rows where recurrence ≠ none. Fixed rows keep their amount; variable rows get amount 0. Both keep their recurrence kind and are stamped with `carried_amount` = source amount (uniformly, even for fixed rows, keeping the copy logic unconditional). Category pruning changes from "branch contains a recurring expense" to "branch contains an expense with recurrence ≠ none"; ancestor-chain retention and ID remapping are untouched.
- **API contract**: the upsert inputs on the expenses and incomes routers replace the boolean `recurring` with a `recurrence` enum (`none` | `fixed` | `variable`). `carried_amount` is never accepted as input; updates must not touch it, so it survives edits, category moves, and kind changes. List/read outputs include both `recurrence` and `carried_amount`.
- **Ghost hint data flow**: the hint is rendered purely from the row's own `carried_amount` (stamped at copy time) — no read-time joins to the previous snapshot. Rationale: survives renames and recategorization, keeps snapshots self-contained, zero extra queries. This is the one decision worth an ADR (stamped-at-carry-time vs computed-at-read-time).
- **Forms (expense add/edit, income add/edit)**: "Toistuva" checkbox retained; when checked, an inline two-pill segmented choice *Kiinteä | Muuttuva* appears on the same line (no layout jump), defaulting to Kiinteä. Unchecking saves as one-off; the pill choice is remembered in local form state while the form is open; opening a form always reflects the saved kind.
- **Row display**: fixed → `↻` (tooltip "Kiinteä toistuva"); variable → `↻⁰` (tooltip "Muuttuva toistuva"). Variable rows with a non-null carried amount show a muted `ed. kk <amount>` figure beside the current amount, in view mode, edit mode, and during ± quick-adjust. Fixed and one-off rows never show the hint. No green/red coloring on the hint (redesign rule: color only on real figures).
- **Sankey / dashboard**: no changes — the Sankey builder already filters zero-amount items, and the dashboard summary sums amounts where zeros are harmless.
- **Import script**: the one-time JSON importer maps its recurring determination to `fixed` / `none` and leaves `carried_amount` null; historical months don't need ghost hints, and the first real carry-forward after import stamps them going forward.
- **Localization**: all new copy in Finnish only, added to the central strings module per the app's localization convention.

## Testing Decisions

- Tests assert external behavior at the highest existing seams; no new seams are introduced. Good tests here call the public API (tRPC caller) or the service function and assert on returned/queried data — never on SQL strings or component internals.
- **tRPC caller seam** (in-memory SQLite + `createCaller`, prior art: all router tests): recurrence enum accepted/rejected on both upsert routers; `carried_amount` not client-writable and untouched by updates; outputs include the new fields; end-to-end snapshot creation carries fixed with amount, variable at zero.
- **Carry-forward service seam** (prior art: existing carry-forward tests): variable expenses/incomes zeroed, fixed amounts preserved, kind stickiness across successive snapshots, `carried_amount` stamped from source amounts, category pruning keeps branches containing variable-only expenses, hand-created rows have null `carried_amount`.
- **Migration seam** (prior art: schema tests): a targeted test applies the pre-existing migrations, inserts legacy `recurring` rows, then runs the migration runner and asserts the backfill (`1 → fixed`, `0 → none`), the CHECK constraint, and the dropped column.
- **Client**: prior art tests only pure lib functions; the new UI (checkbox + pills, markers, ghost hint) contains no extractable pure logic and stays untested, consistent with the codebase.
- Existing tests that pass `recurring` booleans are updated to the new enum across all router and service test files.

## Out of Scope

- Variable-income or expense **budgeting/targets** (e.g. "groceries budget €600") — the ghost hint is the only pacing aid.
- Backfilling `carried_amount` between historically imported months.
- Any ghost hint on fixed rows (their amount *is* last month's) or on hand-created rows.
- Multi-currency, category-level recurrence defaults, or bulk "mark all as variable" tooling.
- Changes to the Sankey diagram, dashboard summary, accounts, or the ± adjust mechanics.
- English localization or a language toggle.

## Further Notes

- Vocabulary is recorded in CONTEXT.md (*Recurrence*, *One-off*, *Fixed*, *Variable*, *Carried amount*); use these terms in code identifiers and copy discussions.
- An ADR for the stamped-at-carry-time carried amount was proposed during design (hard to backfill later, surprising without context, real trade-off vs read-time computation); write it as part of implementation.
- The expected monthly workflow this enables: variable items start at €0 and grow through the month via ± quick-adjust folds, with the ghost hint as the pacing reference.
