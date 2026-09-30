---
title: Tri-state recurrence for expenses and incomes, end-to-end
labels: []
status: closed
blocked-by: []
---

# Tri-state recurrence for expenses and incomes, end-to-end

## Parent

PRD: [Recurrence kinds — fixed and variable carry-forward](../prd/recurrence-kinds.md)

## What to build

Replace the boolean "recurring" notion with the tri-state **recurrence** property (`none` / `fixed` / `variable`) on both expenses and incomes, per the CONTEXT.md glossary, and make carry-forward honor it.

End-to-end behavior: the user marks an expense or income as *Muuttuva* (variable); when the next monthly snapshot is created, that item appears at €0, still variable, with its category branch intact. *Kiinteä* (fixed) items carry forward with their previous amount exactly as recurring items do today, and one-off items still don't carry at all. The recurrence kind itself is sticky across snapshots.

Scope:

- **Schema**: one new numbered migration covering both tables — add a text `recurrence` column (NOT NULL, default `none`, CHECK-constrained to the three kinds), backfill `recurring=1 → fixed` and `0 → none`, drop the old `recurring` column. Existing recurring items become fixed; the user opts items into variable by hand.
- **Carry-forward**: copy rows where recurrence ≠ none; fixed keeps its amount, variable gets amount 0; both keep their kind. Category pruning keeps branches containing any expense with recurrence ≠ none (ancestor-chain retention and ID remapping unchanged).
- **API**: both upsert routers replace the boolean `recurring` input with a `recurrence` enum; reads return it. No back-compat shim.
- **UI (expense add/edit, income add/edit)**: keep the "Toistuva" checkbox; when checked, an inline two-pill choice *Kiinteä | Muuttuva* appears on the same line (no layout jump), defaulting to Kiinteä. Unchecking saves as one-off. The pill choice is remembered in local form state while the form is open; opening a form reflects the saved kind.
- **Row display**: fixed → `↻` (tooltip "Kiinteä toistuva"), variable → `↻⁰` (tooltip "Muuttuva toistuva"), for both expense and income rows.
- **Import script**: the one-time JSON importer maps its recurring determination to `fixed` / `none` so it keeps working against the new schema.
- **Copy**: all new Finnish strings live in the central strings module.

## Acceptance criteria

- [ ] Migration backfills every `recurring=1` row to `fixed` and `0` to `none`, drops the old column, and rejects values outside the three kinds (both tables)
- [ ] Creating a snapshot carries fixed items with their previous amount and variable items at €0, for both expenses and incomes
- [ ] The recurrence kind survives carry-forward unchanged (variable stays variable next month)
- [ ] A category whose only expense is variable survives carry-forward pruning
- [ ] One-off items do not carry forward (unchanged behavior)
- [ ] Both upsert routers accept only the three-kind enum and reject the old boolean shape and invalid values
- [ ] Checking "Toistuva" reveals the Kiinteä/Muuttuva pills inline, defaulting to Kiinteä; unchecking saves as one-off; the pill choice is remembered while the form is open
- [ ] Opening an edit form reflects the item's saved kind
- [ ] Rows show `↻` for fixed and `↻⁰` for variable, with Finnish tooltips
- [ ] A freshly carried €0 variable item does not appear in the Sankey diagram (existing zero-filtering; no Sankey changes)
- [ ] Import script writes valid recurrence values against the new schema
- [ ] Tests updated/added at the tRPC caller seam, the carry-forward service seam, and the migration seam (legacy-row backfill test); full suite passes

## Blocked by

None - can start immediately

## Resolution

Implemented in `e9e3668`.
