import type { Database } from 'bun:sqlite';

// Call from every mutation that creates, updates, or deletes a child record
// (account, expense, income, category) to keep snapshots.updated_at current
// (spec §9 — implemented in the mutation layer, not via DB triggers).
export function touchSnapshot(db: Database, snapshotId: number): void {
  db.run("UPDATE snapshots SET updated_at = datetime('now') WHERE id = ?", [snapshotId]);
}
