# ADR 0001 — Stamp the carried amount at carry-forward time

- Status: Accepted
- Date: 2026-07-09
- Feature: [Recurrence kinds — fixed and variable carry-forward](../prd/recurrence-kinds.md)
- Issue: [002 — Carried amount stamping and "ed. kk" ghost hint](../issues/002-carried-amount-ghost-hint.md)

## Context

Variable recurring rows carry forward at €0 and are filled in through the month.
To help the user judge whether they're on pace, a variable row shows last month's
amount as a muted "ed. kk" ghost hint beside its current figure.

"Last month's amount" can be sourced two ways:

1. **Stamped at carry-forward time** — copy the source amount into a new
   `carried_amount` column on the row when the snapshot is created. The hint reads
   the row's own column.
2. **Computed at read time** — on every read, look up the matching row in the
   previous snapshot and use its amount.

Snapshots are otherwise fully self-contained: carry-forward copies rows, remapping
IDs, and no row references another snapshot. Rows are freely renamed,
recategorized, and re-parented after carry-forward, and their kind can change
mid-month.

## Decision

Stamp the carried amount at carry-forward time into a nullable, server-managed
`carried_amount` column on both `expenses` and `incomes`. It is written only by
the carry-forward service — the API never accepts it as input and updates never
touch it. Rows created by hand within a month have `carried_amount = NULL` and
show no hint. Every carried row is stamped, fixed and variable alike (keeping the
copy logic unconditional); only variable rows render the hint.

## Consequences

**Positive**

- **Survives edits.** Renaming, recategorizing, re-parenting, or changing the
  amount or kind of a row can never desync the hint — there is nothing to match
  against. The hint always means "what this row was last month", verbatim.
- **Snapshots stay self-contained.** No read-time join to a sibling snapshot;
  reads remain single-table queries. The ghost hint costs zero extra queries.
- **Read-only guarantee is cheap.** Because the value is stamped once and never
  updated, a "not client-writable, untouched by updates" contract is enforced
  simply by omitting the column from the upsert input and every UPDATE.

**Negative**

- **Not backfillable.** Historically imported months have no carried amount and
  can't get a truthful one retroactively — the previous month's matching row is
  ambiguous once rows have been edited. Accepted: the first real carry-forward
  after import stamps it going forward; historical months don't need the hint.
- **Surprising without context.** A stored "amount from last month" that no UI
  lets you edit is non-obvious to a future reader — hence this ADR.
- **Read-time computation was the alternative.** It needs no schema change and is
  always current, but it breaks the moment a row is renamed or moved and forces a
  per-row lookup into another snapshot on every read. The stamped value trades a
  column for correctness under editing, which is the common case here.
