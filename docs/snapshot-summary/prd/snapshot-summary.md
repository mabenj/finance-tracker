---
title: Snapshot summary — replace the per-account bar chart with per-account change and monthly figures
labels: []
status: done
---

# Snapshot summary — replace the per-account bar chart with per-account change and monthly figures

## Problem Statement

The top card of the snapshot page shows the **net worth** figure and its change, followed by a bar chart comparing each account's balance in this snapshot with the previous one. From month to month, account balances change only slightly compared with their size. The chart's Y axis runs from zero to the largest balance, so a €300 movement on a €40,000 account shifts a bar by less than one percent. The "previous" and "current" bars always look the same. The chart takes up the most prominent spot on the page and tells the user nothing: they can't see which accounts moved, by how much, or how the month went.

## Solution

Remove the bar chart and keep the net worth headline (the figure, plus its change against the most recent prior snapshot). Put two text-based views in its place. Text shows small changes clearly where bars can't:

- **Monthly figures** in the headline card, directly under the net worth figure: **Tulot** (income), **Menot** (expenses), and either **Ylijäämä** (surplus) or **Alijäämä** (deficit), whichever applies. These are plain numbers with no comparison to the previous month.
- A **Muutos** (change) column in the accounts table showing each account's balance change against the most recent prior snapshot. The arrow shows the direction the balance moved. The colour shows the effect on net worth. Accounts that are new this month show their full balance as the change. Accounts that existed in the prior snapshot but not in this one appear as muted ghost rows, so every net worth movement is visible in the table.

## User Stories

1. As the user, I want the uninformative per-account bar chart removed from the snapshot page, so that the most prominent spot on the page isn't wasted on bars that always look the same.
2. As the user, I want the net worth figure to stay at the top of the snapshot page, so that I still see the month's bottom line first.
3. As the user, I want the net worth change against the most recent prior snapshot to stay in the headline, so that I know at a glance whether I'm better or worse off.
4. As the user, I want to see this snapshot's total income in the headline card, so that I can read the month's inflow without scrolling to the income section.
5. As the user, I want to see this snapshot's total expenses in the headline card, so that I can read the month's outflow without adding up the expense tree.
6. As the user, I want to see this snapshot's surplus in the headline card when income exceeds expenses, so that I know how much money was left unallocated.
7. As the user, I want the third figure to read "Alijäämä" and show the shortfall as a positive amount when expenses exceed income, so that a deficit month is labelled for what it is rather than shown as a negative surplus.
8. As the user, I want a month where income exactly equals expenses to show "Ylijäämä €0", so that the figure is never missing or ambiguous.
9. As the user, I want a month with no income and some expenses to show a deficit equal to the expenses, so that the figures stay consistent with the definition of deficit.
10. As the user, I want a month with no income and no expenses to show €0 for all three figures, so that an empty snapshot doesn't break the card.
11. As the user, I want the monthly figures shown without a comparison to the previous month, so that a half-entered month (with **variable** items still at €0) doesn't show misleading drops in expenses.
12. As the user, I want the monthly figures to update right away when I add, edit or delete an income or expense, so that the headline always matches the sections below it.
13. As the user, I want each account row to show how much its balance changed since the most recent prior snapshot, so that I can see exactly which accounts moved and by how much.
14. As the user, I want each change shown as an exact euro amount, so that a €300 movement on a €40,000 account is as readable as a large one.
15. As the user, I want the change arrow to point in the direction the balance actually moved, so that the column describes what happened to the account.
16. As the user, I want a rising asset balance shown in green and a falling one in red, so that the colour tells me the effect on my net worth.
17. As the user, I want a falling liability balance (e.g. a loan paid down from €80,000 to €79,500) shown as a downward arrow in green, so that paying down debt reads as an improvement.
18. As the user, I want a rising liability balance shown as an upward arrow in red, so that taking on more debt reads as a worsening.
19. As the user, I want an account whose balance didn't change to show a muted "—" instead of a zero amount with an arrow, so that unchanged accounts don't draw attention.
20. As the user, I want accounts matched between snapshots by name, so that an account carried forward from the prior snapshot is compared with itself.
21. As the user, I want an account that didn't exist in the prior snapshot to show its full balance as its change, so that opening a new account shows up as the net worth movement it is.
22. As the user, I want an account that existed in the prior snapshot but not in this one to appear as a muted ghost row with a struck-through name, a €0 balance and its full prior balance as a negative change, so that closing or removing an account doesn't disappear from the explanation.
23. As the user, I want ghost rows to have no edit, delete or reorder controls, so that I can't try to change an account that doesn't exist in this snapshot.
24. As the user, I want ghost rows to appear after the snapshot's real accounts, so that they don't disrupt the order I set for my accounts.
25. As the user, I want the net worth effects of all rows in the change column, ghost rows included, to add up to the headline net worth change, so that the table fully explains the headline.
26. As the user, I want a renamed account to appear as one new account plus one ghost row for that month, so that the behaviour is predictable even if not ideal.
27. As the user, I want the change column hidden entirely on the first snapshot (which has no prior snapshot), so that I don't see every balance marked as new.
28. As the user, I want the change column visible in edit mode, so that I can spot a typo (such as a −€40,000 change) while entering balances.
29. As the user, I want the change column to recalculate as soon as I save an edited balance, so that the feedback comes while I'm still entering the month.
30. As the user, I want the change column visible in view mode, so that I can review the month's account movements when I'm not editing.
31. As the user, I want the Kategoria column hidden on narrow screens, so that the change column fits on my phone without horizontal scrolling.
32. As the user, I want the comparison made against the most recent prior snapshot even when a calendar month is missing between them, so that the change column agrees with the headline change.
33. As the user, I want the change column and monthly figures styled with the existing figure and change treatments, so that the page stays visually consistent with the rest of the app.
34. As the user, I want green and red used only on figures, so that the redesign's colour discipline is kept.
35. As the user, I want the snapshot page to work the same in light and dark themes after the chart is removed, so that neither theme is left with stray chart styling.

## Implementation Decisions

- **Remove the per-account bar chart** from the net worth headline card. Keep the headline itself: the net worth figure, the change against the most recent prior snapshot (absolute and, when meaningful, percentage), and the "compared with" prior net worth. The existing no-prior-snapshot message stays.
- **Per-account change calculation (net-worth module).** Replace the chart-data builder with a pure function that takes the current snapshot's accounts and the prior snapshot's accounts (or nothing when there is no prior snapshot). It returns:
  - nothing (a "no comparison" result) when there is no prior snapshot;
  - otherwise one row per account, with the current snapshot's accounts first in their existing order, followed by ghost rows for accounts that exist only in the prior snapshot.

  Each row carries:
  - the account's identity (the current row for real accounts, the prior name and type for ghost rows)
  - the signed **balance change** (current balance − prior balance, where a missing side counts as 0)
  - the signed **net worth effect** (equal to the balance change for assets, its negation for liabilities)
  - a kind: matched, new, or ghost

  Accounts are matched by exact name. If an account's type differs between snapshots, the change and effect follow each side's own type, so the net worth effect still sums correctly.
- **Monthly figures calculation.** A new small pure function takes the snapshot's incomes and expenses and returns total income, total expenses, and the residual as either `surplus` or `deficit`, with a non-negative amount. Equal totals give a surplus of 0. The Sankey builder has its own inline version of this arithmetic. It is off-limits and is not refactored to use the new function.
- **Change display component.** The shared change component currently derives both its arrow direction and its green/red colour from the sign of one value. It gains a way to set the tone separately from the arrow. The accounts table passes the balance change for the arrow and the net worth effect for the colour. Existing call sites keep their current behaviour.
- **Accounts section.** It receives the prior snapshot's accounts, which the snapshot page already loads for the headline, and renders the Muutos column from the per-account change calculation:
  - in both view and edit modes;
  - hidden entirely when there is no prior snapshot;
  - with ghost rows rendered read-only, muted and struck through, with a €0 balance and no row actions;
  - with unchanged rows showing a muted "—".

  On narrow screens the Kategoria column is hidden.
- **Headline card.** It renders the three monthly figures below the net worth line, where the chart used to be. The snapshot detail component passes the snapshot's incomes and expenses to the card.
- **Strings.** New Finnish copy is added to the central strings module: the change column heading "Muutos", and the monthly figure labels "Tulot", "Menot", "Ylijäämä" and "Alijäämä" (reusing existing surplus/deficit copy if suitable).
- **Dependency and theme cleanup.** The chart library was used only by this chart and is removed from the client's dependencies, along with the chart colour palette in the theme module and the chart-data builder.
- **No server or schema changes.** The snapshot query already returns the prior snapshot's accounts, and the monthly figures come from data already on the page.
- **Glossary.** **Net worth** has been added to the project glossary. "Savings" and "savings rate" are deliberately not used, per the glossary's definition of **surplus**.

## Testing Decisions

- Good tests here call a pure function with plain account, income and expense data and assert on its returned values. They don't depend on how the function works internally, so they only need to change when the agreed behaviour does. No component or rendering tests. The client has no component-test setup, and this feature doesn't add one.
- **Per-account change calculation** (the main seam), covering:
  - no prior snapshot → no comparison;
  - a matched asset that rose and one that fell (balance change and net worth effect have the same sign);
  - a matched liability that fell and one that rose (balance change and net worth effect have opposite signs);
  - an unchanged account (zero change, marked as unchanged);
  - a new account (change equals its full balance, with a positive effect for an asset and a negative one for a liability);
  - a ghost account (placed after the current accounts, change equals minus its prior balance, effect signed by its prior type);
  - a rename (produces one new row and one ghost row);
  - ordering (current accounts in their given order, then ghost rows);
  - a type change between snapshots;
  - the sum of net worth effects across all rows equals the headline net worth change on a mixed fixture.
- **Monthly figures calculation** (the second seam), covering: a surplus month, a deficit month, equal totals (surplus of 0), no income with expenses (a deficit), and empty inputs (everything 0).
- **Prior art:** the existing Bun tests for the net-worth module (percentage and delta tests, which stay), and the pure-function tests for the Sankey builder and category totals in the same library folder. The chart-data builder's tests are deleted along with the builder.
- UI wiring is checked by running the app, not by automated tests. That covers the separate tone option on the change component, column visibility in each mode, ghost row styling, the hidden Kategoria column on narrow screens, and the headline figures layout.

## Out of Scope

- Month-over-month comparison of the monthly figures, and any notion of a "complete" month.
- A net worth trend over time (a sparkline or line chart across snapshots).
- A breakdown of the net worth change into surplus versus other movements (market returns, value changes, untracked flows).
- A savings rate or surplus rate figure.
- Stable account identity across snapshots (matching renamed accounts). Matching stays by name.
- Any change to the Sankey diagram or its builder.
- Changes to the dashboard's net worth display.
- Server, API or schema changes.

## Further Notes

- The comparison baseline everywhere is the most recent prior snapshot, as the glossary defines for **net worth** change. It is not necessarily the previous calendar month.
- Ghost rows exist so that the change column adds up to the headline change. If they turn out to be visual noise in practice, they can be removed without affecting the rest of the design.
- A renamed account showing as "new + ghost" for one month is a known, accepted limitation of matching by name.

## Resolution

Delivered by issues 001 (`2d2a26b`) and 002 (`5614785`, `0d2c60f`). Departures from the text above: Maksettu yhteensä is also hidden on narrow screens, and "ghost rows" are named **departed accounts** per the glossary.
