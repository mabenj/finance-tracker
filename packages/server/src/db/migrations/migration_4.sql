-- Add a nullable `carried_amount` (EUR cents) to both expenses and incomes.
-- Stamped by the carry-forward service with the amount a row had in the previous
-- snapshot; NULL on rows created by hand within a month. It is server-managed and
-- read-only to the client, so it always means "what this was last month" and can
-- never drift. Variable rows render it as a muted "ed. kk" ghost hint. No
-- historical backfill — the first real carry-forward after import stamps it.

ALTER TABLE expenses ADD COLUMN carried_amount INTEGER CHECK(carried_amount >= 0);

ALTER TABLE incomes ADD COLUMN carried_amount INTEGER CHECK(carried_amount >= 0);
