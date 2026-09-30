---
title: Muutos column — per-account change in the accounts table
labels: []
status: closed
blocked-by: []
---

# Muutos column — per-account change in the accounts table

## Parent

PRD: [Snapshot summary — replace the per-account bar chart with per-account change and monthly figures](../prd/snapshot-summary.md)

## What to build

Add a **Muutos** column to the accounts table showing each account's balance change against the most recent prior snapshot. The arrow shows which way the balance moved. The colour shows the effect on **net worth**. Accounts new this month show their full balance as the change. Accounts that existed in the prior snapshot but not in this one appear as muted ghost rows, so the net worth effects in the table add up to the headline net worth change.

End-to-end behavior: in a snapshot where the checking account rose €312, the savings account didn't change, and the loan fell from €80,000 to €79,500, the table shows `▲ 312,00 €` in green, a muted `—`, and `▼ 500,00 €` in **green** (the balance fell, but that's good for net worth). A savings account opened this month with €2,000 shows `▲ 2 000,00 €`. An account deleted since the prior snapshot, which held €1,200, appears after the real accounts as a muted, struck-through ghost row: balance €0, change `▼ 1 200,00 €` in red, no edit, delete or reorder controls. Renaming an account shows as one new row plus one ghost row for that month (a known limitation). The column is hidden on the first snapshot. It appears in both view and edit mode, and recalculates as soon as an edited balance is saved. On narrow screens the Kategoria column is hidden to make room.

Scope:

- **Per-account change calculation (net-worth module)**: a pure function that takes the current accounts and the prior snapshot's accounts (or nothing). It returns "no comparison" when there is no prior snapshot. Otherwise it returns rows: current accounts first in their given order, then ghost rows for accounts that exist only in the prior snapshot. Each row carries:
  - the account's identity
  - the signed balance change (a missing side counts as 0)
  - the signed net worth effect (the balance change for assets, its negation for liabilities; each side uses its own type if the type changed)
  - a kind: matched, new, or ghost

  Accounts are matched by exact name.
- **Change display component**: add a way to set the green/red tone separately from the arrow direction. Existing call sites keep their current behaviour.
- **Accounts section**: receives the prior snapshot's accounts (already loaded by the snapshot page). It renders the column from the calculation above, with ghost rows read-only and muted, a "—" for unchanged rows, and the column hidden when there is no prior snapshot. Kategoria is hidden on narrow screens.
- **Strings**: Finnish copy for the "Muutos" heading in the central strings module.

## Acceptance criteria

- [ ] Each account row shows its balance change against the most recent prior snapshot, even when a calendar month is missing in between
- [ ] Arrow direction follows the balance; colour follows the net worth effect (a falling liability shows a downward arrow in green, a rising one an upward arrow in red)
- [ ] Unchanged accounts show a muted "—"
- [ ] New accounts show their full balance as the change
- [ ] Deleted accounts appear after the real accounts as muted, struck-through ghost rows with a €0 balance, their negative change, and no row actions
- [ ] The column is hidden entirely on a snapshot with no prior snapshot
- [ ] The column appears in both view and edit mode and updates after a balance is saved
- [ ] On narrow screens the Kategoria column is hidden and the table fits without horizontal scrolling
- [ ] Existing uses of the change display component look and behave as before
- [ ] Tests for the per-account change function cover: no prior snapshot; rising/falling assets; rising/falling liabilities; unchanged account; new asset and new liability; ghost account (placement, sign); rename (new + ghost); ordering; type change between snapshots; and net worth effects summing to the headline net worth change on a mixed fixture. Full suite passes

## Blocked by

None (can start immediately).

## Resolution

Implemented in `5614785`; narrow-screen fit (Maksettu yhteensä also hidden on phones) and the *departed account* naming followed in `0d2c60f`.
