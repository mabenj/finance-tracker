# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Bun is not on PATH — always use `npx bun` instead of `bun`.**

```bash
# Development (run in separate terminals)
npx bun run dev:server        # API server on :3001
npx bun run dev:client        # Vite dev server on :5173

# Production
npx bun run build             # Build client → packages/client/dist
npx bun run start             # Run server (serves dist/ statically)

# Tests (all packages)
npx bun run test

# Tests (single package)
npx bun run --cwd packages/server test
npx bun run --cwd packages/client test

# Single test file
npx bun test packages/server/src/routers/snapshots.test.ts
```

There is no lint script configured.

## Architecture

Bun monorepo with two packages. The server runs on Bun runtime (no Node); the client is a Vite/React SPA. In production, the server also serves the compiled client from `packages/client/dist`.

### Data flow

```
Browser → tRPC Client (React Query) → /trpc/* → tRPC Server → Bun SQLite
```

The Vite dev server proxies `/trpc` to `http://localhost:3001`. In production, both are served from port 3001.

### Server (`packages/server`)

- Entry: `src/index.ts` — `Bun.serve()` with two routes: `/trpc/*` (tRPC handler) and `/*` (static SPA fallback)
- tRPC router composition: `src/routers/index.ts` assembles `snapshots`, `accounts`, `incomes`, `categories`, `expenses`, `dashboard`
- DB: `src/db/client.ts` initializes the SQLite file at `finance.db` using `src/db/schema.ts`
- Shared validators: `src/lib/validators.ts` — `trimmedText` (1–100 chars) and `eurCents` (non-negative integer)
- Context: `{ db: Database }` passed to every tRPC procedure

**Carry-forward logic** (`src/lib/carry-forward.ts`): when a new snapshot is created, the server copies accounts, the full category tree (remapping IDs), and recurring-only expenses/incomes from the most recent prior snapshot.

### Client (`packages/client`)

- tRPC client: `src/lib/trpc.ts` — `createTRPCReact<AppRouter>()` pointing to `/trpc`
- Routes: `/` → Dashboard, `/snapshots/:id` → Snapshot detail
- `SnapshotDetail` is the master component; it owns all sub-sections: `AccountsSection`, `IncomeSection`, `ExpenseTree`, `NetWorthComparison`, `SankeyDiagram`

### Database schema

All monetary amounts are stored as **integer EUR cents** (e.g. €12.34 = `1234`). Foreign keys are enabled. Cascading deletes flow from `snapshots` → all child tables.

| Table | Key constraints |
|---|---|
| `snapshots` | `UNIQUE(year, month)` |
| `accounts` | `type IN ('asset','liability')`, `balance >= 0` |
| `expense_categories` | Self-referential `parent_id`; unique name per (snapshot, parent) level |
| `expenses` | `amount >= 0`, `recurring IN (0,1)` |
| `incomes` | `amount >= 0`, `recurring IN (0,1)` |

### Key client utilities

- `src/lib/currency.ts` — formats EUR cents using `de-DE` locale
- `src/lib/sum-tree.ts` — DFS to aggregate expense category totals
- `src/lib/sankey-builder.ts` — builds D3-Sankey graph (income → expenses → savings/deficit)
- `src/lib/net-worth.ts` — computes net worth delta and Recharts comparison data
- `src/components/ui/toast.tsx` — toast notifications via React context
