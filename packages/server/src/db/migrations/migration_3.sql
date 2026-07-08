-- Replace the boolean `recurring` flag with a tri-state `recurrence` property
-- on both expenses and incomes:
--   none     → does not carry forward (was recurring = 0)
--   fixed    → carries forward with its previous amount (was recurring = 1)
--   variable → carries forward at €0, filled in as the month unfolds
-- Existing recurring rows become `fixed`; the user opts items into `variable`
-- by hand. No back-compat shim — client and server deploy together.

-- Expenses ------------------------------------------------------------------
ALTER TABLE expenses ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK(recurrence IN ('none', 'fixed', 'variable'));

UPDATE expenses SET recurrence = CASE WHEN recurring = 1 THEN 'fixed' ELSE 'none' END;

ALTER TABLE expenses DROP COLUMN recurring;

-- Incomes -------------------------------------------------------------------
ALTER TABLE incomes ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK(recurrence IN ('none', 'fixed', 'variable'));

UPDATE incomes SET recurrence = CASE WHEN recurring = 1 THEN 'fixed' ELSE 'none' END;

ALTER TABLE incomes DROP COLUMN recurring;
