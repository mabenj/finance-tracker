-- Manual row ordering: each table gets a `position` column scoped to its
-- sibling group. Positions are contiguous (0,1,2…) within scope.
--   accounts / incomes      → scope = snapshot_id
--   expense_categories      → scope = (snapshot_id, parent_id)
--   expenses                → scope = category_id
-- Backfill seeds positions from today's display order so the rollout is
-- visually invisible: accounts/incomes by id, categories alphabetical,
-- expenses amount-descending (id tiebreak).

ALTER TABLE accounts            ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE incomes             ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expense_categories  ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses            ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

WITH r AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY snapshot_id ORDER BY id) - 1 AS p
  FROM accounts
)
UPDATE accounts SET position = (SELECT p FROM r WHERE r.id = accounts.id);

WITH r AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY snapshot_id ORDER BY id) - 1 AS p
  FROM incomes
)
UPDATE incomes SET position = (SELECT p FROM r WHERE r.id = incomes.id);

WITH r AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY snapshot_id, parent_id ORDER BY name) - 1 AS p
  FROM expense_categories
)
UPDATE expense_categories SET position = (SELECT p FROM r WHERE r.id = expense_categories.id);

WITH r AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY amount DESC, id) - 1 AS p
  FROM expenses
)
UPDATE expenses SET position = (SELECT p FROM r WHERE r.id = expenses.id);
