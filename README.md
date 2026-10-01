# Finance Tracker

A personal, self-hosted finance tracker built around monthly **snapshots**. Each month records your accounts (assets and liabilities), incomes, and a tree of expense categories. Creating a new month copies the previous one forward: accounts and recurring items come along, one-offs don't.

The app shows net worth over time, month-over-month changes per account, and a Sankey diagram of where the month's income went. The UI is in Finnish, and all amounts are in EUR.

**Stack:** Bun · tRPC · SQLite (`bun:sqlite`) · React · Vite · Tailwind · D3-Sankey

## Setup

You need [Node.js](https://nodejs.org/) (for `npx`). Bun is pulled in through `npx bun`, so you don't have to install it globally. If you already have `bun` on your PATH, you can use `bun` wherever this README says `npx bun`.

```bash
git clone <repo-url> finance-tracker
cd finance-tracker
npx bun install
```

You don't need a database server. On the first run the server creates a SQLite file at `packages/server/finance.db` and applies the schema.

## Run it

```bash
npx bun run build    # build the client into packages/client/dist
npx bun run start    # serve the API and the app
```

Then open http://localhost:3001.

You can set `PORT` to change the port and `DB_PATH` to move the database file. To back up your data, copy `finance.db`.

## Develop

Start the server and the client in two separate terminals:

```bash
npx bun run dev:server   # API on :3001, restarts when files change
npx bun run dev:client   # Vite on :5173, with hot reload
```

Then open http://localhost:5173. Vite forwards `/trpc` requests to the API server.

Tests:

```bash
npx bun run test                                            # all packages
npx bun run --cwd packages/server test                      # one package
npx bun test packages/server/src/routers/snapshots.test.ts  # one file
```

No linter is configured.

### Project layout

```
packages/
  server/   Bun + tRPC API, SQLite schema, carry-forward logic
  client/   React SPA (Vite), calls the API through a typed tRPC client
docs/       Specs, PRDs, ADRs and issue write-ups for features
CONTEXT.md  Domain glossary (snapshot, carry-forward, recurrence, …)
```

### Importing historical data

A one-time importer loads monthly JSON files (named `YYYY-MM-DD.json`) into the database:

```bash
npx bun packages/server/scripts/import-snapshots.ts <dir> [--dry-run] [--replace]
```

### Developing with AI

The repo is set up for [Claude Code](https://claude.com/claude-code), and the same files work with other coding agents:

- **`CLAUDE.md`**: commands, architecture, data flow, and the DB schema. The agent reads it automatically.
- **`CONTEXT.md`**: the domain vocabulary. Point the agent at it so that it names things consistently (for example, *surplus* rather than *savings*).
- **`docs/`**: feature specs, PRDs, and ADRs. A good way to work is to write or extend a spec there first, then have the agent implement it test-first.

Workflow tips:

- Run `npx bun run test` before and after changes made by an agent.
- When you change architecture or commands, update `CLAUDE.md` so that future sessions start with accurate context.

You can work without AI too: `CLAUDE.md` and `CONTEXT.md` are also the quickest way for a person to get oriented.
