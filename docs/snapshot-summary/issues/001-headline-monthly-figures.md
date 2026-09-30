---
title: Replace the per-account bar chart with monthly figures in the net worth headline
labels: []
status: closed
blocked-by: []
---

# Replace the per-account bar chart with monthly figures in the net worth headline

## Parent

PRD: [Snapshot summary — replace the per-account bar chart with per-account change and monthly figures](../prd/snapshot-summary.md)

## What to build

Remove the per-account bar chart from the net worth headline card on the snapshot page. In its place, directly under the net worth figure, show the month's cash flow as three plain figures: **Tulot** (total income), **Menot** (total expenses), and either **Ylijäämä** (surplus) or **Alijäämä** (deficit), whichever applies, always as a non-negative amount.

End-to-end behavior: opening a snapshot with €4,200 income and €3,100 expenses shows the net worth figure and its change as before, then `Tulot 4 200,00 €`, `Menot 3 100,00 €`, `Ylijäämä 1 100,00 €`. If expenses exceed income by €300, the third figure reads `Alijäämä 300,00 €`. Equal totals show `Ylijäämä 0,00 €`. A snapshot with no income and no expenses shows €0 for all three figures. There is no comparison with the previous month: a half-entered month with **variable** items still at €0 must not show misleading drops. Adding, editing or deleting an income or expense updates the figures immediately.

Scope:

- **Monthly figures calculation**: a new small pure function in the client's library that takes the snapshot's incomes and expenses and returns total income, total expenses, and the residual as `surplus` or `deficit` with a non-negative amount (equal totals give a surplus of 0). The Sankey builder's inline version of this arithmetic is off-limits. Don't refactor it.
- **Headline card**: remove the bar chart and render the three figures below the net worth line using the existing figure treatment. Keep the net worth figure, its change against the most recent prior snapshot, the "compared with" prior net worth, and the no-prior-snapshot message unchanged. The snapshot detail component passes the incomes and expenses to the card.
- **Strings**: Finnish copy for "Tulot", "Menot", "Ylijäämä" and "Alijäämä" in the central strings module. Reuse the existing surplus/deficit copy if it fits.
- **Cleanup**: remove the per-account chart-data builder and its tests, the chart colour palette in the theme module, and the chart library from the client's dependencies (this chart was its only user). The remaining net-worth utilities and their tests stay.

## Acceptance criteria

- [ ] The per-account bar chart no longer appears on the snapshot page, in light or dark theme
- [ ] The net worth figure, its change (absolute and, when meaningful, percentage), the "compared with" prior net worth, and the no-prior-snapshot message are unchanged
- [ ] Tulot, Menot and Ylijäämä/Alijäämä appear under the net worth figure with correct totals
- [ ] A deficit month is labelled Alijäämä and shows the shortfall as a positive amount; equal totals show Ylijäämä €0; empty snapshots show €0 for all three figures
- [ ] The figures update immediately when incomes or expenses change
- [ ] No month-over-month comparison is shown on the figures
- [ ] Green/red is used only on figures (redesign rule)
- [ ] The chart library, chart palette and chart-data builder (with its tests) are removed, and the client builds
- [ ] Tests for the monthly figures function cover: surplus month, deficit month, equal totals, no income with expenses, and empty inputs; full suite passes

## Blocked by

None (can start immediately).

## Resolution

Implemented in `2d2a26b`.
