# Finance Tracker

Personal finance tracker built around monthly **snapshots**: each month is a self-contained copy of accounts, incomes, and an expense-category tree, seeded from the previous month by carry-forward.

## Language

**Snapshot**:
A self-contained monthly record (unique per year+month) of accounts, incomes, categories, and expenses. Snapshots never share rows; carry-forward copies data into a new snapshot.

**Carry-forward**:
The seeding of a new snapshot from the most recent prior one: all accounts, the category tree pruned to branches holding recurring expenses, and the recurring expenses/incomes themselves.

**Recurrence**:
A property of every expense and income with three kinds — *one-off*, *fixed*, *variable* — that governs whether and how the item carries forward.

**One-off**:
An expense or income that does not carry forward into the next snapshot.
_Avoid_: non-recurring

**Fixed**:
A recurring expense or income carried forward with its previous amount (e.g. phone bill, subscriptions, salary).
_Avoid_: static

**Variable**:
A recurring expense or income carried forward at €0, to be filled in as the month unfolds (e.g. groceries, restaurants, freelance income).
_Avoid_: dynamic, zero-start

**Carried amount**:
The amount an expense or income had in the previous snapshot at the moment it was carried forward; absent on items created by hand within the month.
_Avoid_: ghost value, previous amount
