---
title: End-of-month wizard for creating a monthly snapshot
labels: []
status: closed
blocked-by: []
---

# End-of-month wizard for creating a monthly snapshot

## What to build

Replace the "Uusi kuukausikatsaus" month-picker dialog (which created an empty-ish
snapshot and dropped the user into edit mode) with a wizard at `/snapshots/new`
that walks through the month in order: **Tilit → Tulot → Menot → Yhteenveto**.

UI-only: no schema or server changes. The wizard mirrors server carry-forward
exactly (every account; recurring incomes and expenses, fixed prefilled and
variable blank; categories pruned to recurring branches) and holds everything in
memory until "Luo katsaus", then creates the snapshot and saves only the
differences through the existing CRUD mutations.

## Prototype

Settled by a UI prototype — three variants (paged stepper, one-row-at-a-time
focus flow, single-scroll checklist). Primary source: branch
`prototype/snapshot-wizard` (commit `de57569`).

Verdict: **A, the paged stepper** with a running-totals panel, plus feedback
from the session:

- every row's properties are editable inline (name, type, category, recurrence);
  new expense categories can be created
- "Maksettu yhteensä" is editable on liabilities
- expense rows have the same +/− amount accumulator as the snapshot page; it
  closes once applied
- empty amount inputs show no placeholder — last month's figure lives in its own
  column
- carry-over follows the existing rules; accounts always carry, as today
- app name changed to "Finanssiseuranta"

## Acceptance criteria

- [x] "Uusi kuukausikatsaus" (sidebar, dashboard, empty state) opens the wizard; the old dialog is gone
- [x] Defaults to the month after the latest snapshot; month/year can be changed, existing months are disabled, and the draft is re-seeded from the snapshot preceding the chosen month
- [x] Accounts: last month, this month, change; loans show an editable total paid; blank balances can be filled from last month; accounts can be added, edited and removed
- [x] Incomes and expenses: carried rows plus new ones; recurrence editable as "Siirtyy seuraavaan kuuhun"; expense +/− accumulator
- [x] Review lists rows still blank (and what they will be saved as), blocking problems (missing name/category), new rows and what carries to next month
- [x] Nothing is written until "Luo katsaus"; an untouched draft sends no row mutations
- [x] A failure after the snapshot is created opens it in edit mode with a warning
- [x] Tests: draft seeding/validation/month choice, and a commit round-trip through the real tRPC router on an in-memory DB
