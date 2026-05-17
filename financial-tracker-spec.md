# Financial Snapshot Tracker — Application Specification

## 1. Overview

A personal-use web application for creating monthly financial snapshots. Each snapshot captures the user's complete financial picture: account balances (assets and liabilities), income, and expenses. The app provides visualizations to track net worth changes and expense breakdowns over time.

**Single user, no authentication.** Runs on a home server, always accessible on the local network.

---

## 2. Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | React + TypeScript                  |
| UI Library   | shadcn/ui (Radix + Tailwind CSS)    |
| Charts       | Recharts (net worth comparison)     |
| Sankey       | d3-sankey (with React wrapper)      |
| API Layer    | tRPC (end-to-end type safety)       |
| Backend      | Bun + TypeScript                    |
| Database     | SQLite (via `bun:sqlite`)           |
| Auth         | None                                |

---

## 3. Key Definitions

### 3.1 Previous Snapshot

Throughout this specification, **"previous snapshot"** means the most recent existing snapshot by year/month ordering that comes before the current snapshot. It does **not** mean the literal prior calendar month. Gaps between snapshots are allowed and handled gracefully.

Example: if snapshots exist for January, February, and May, then May's "previous snapshot" is February.

This definition applies everywhere: carry-forward logic (§5.1), net worth deltas on the dashboard, and per-account comparisons in the detail view.

**Previous snapshot is always dynamically resolved at query time.** No snapshot stores a reference to its predecessor. Deleting a snapshot causes later snapshots to recalculate their deltas against whatever is now the nearest prior snapshot. If no prior snapshot exists, the snapshot is treated as the first (no deltas shown).

### 3.2 Expected Data Scale

A typical snapshot contains:
- Under **50 expense entries**
- Under **50 expense categories**
- Under **20 accounts**

No pagination, virtual scrolling, or lazy loading is needed. All data for a snapshot is rendered at once.

---

## 4. Core Concepts

### 4.1 Snapshot

A snapshot represents a single month's financial picture. It is identified by **month + year** (e.g., "2026-05"). There can be only **one snapshot per calendar month** (enforced via unique constraint).

A snapshot contains:
- A set of **account balances** (assets and liabilities)
- A list of **income entries**
- A list of **expense entries**
- A **category tree** (used by expenses, scoped to this snapshot)

### 4.2 Accounts

Accounts represent financial holdings and debts. They are **dynamic** — the user can add, remove, and rename account types over time.

Each account has:
- **Name** (string, e.g., "Mortgage", "Coinbase Portfolio", "CS:GO Inventory")
- **Type** (enum: `asset` | `liability`)
- **Category** (string, e.g., "real estate", "investment", "debt", "cash") — flat, not hierarchical
- **Balance** (integer, in EUR cents) — for liabilities, this is the amount still owed
- **Total Paid** (integer, in EUR cents, optional) — only relevant for loans (mortgage, student loan). This is a **cumulative lifetime total** of payments made, manually maintained by the user. It is carried forward from the previous snapshot and manually incremented each month. There is no automatic derivation from expense entries.

Initial accounts (pre-populated on first snapshot):

| Name                  | Type      | Category    | Has "Total Paid" |
|-----------------------|-----------|-------------|-------------------|
| Mortgage              | liability | debt        | Yes               |
| Student Loan          | liability | debt        | Yes               |
| Credit Card           | liability | debt        | No                |
| Cash                  | asset     | cash        | No                |
| Investment Portfolio  | asset     | investment  | No                |
| CS:GO Inventory       | asset     | investment  | No                |
| Coinbase Portfolio    | asset     | investment  | No                |
| Apartment (Cash Paid) | asset     | real estate | No                |

**Cross-snapshot account comparison** is done by matching on exact account name. There is no global account registry or persistent account identity across snapshots. If a user renames an account, the old and new names are treated as different accounts in comparisons. When comparing two snapshots, the union of account names from both snapshots is used; accounts present in only one snapshot show €0 for the other side.

### 4.3 Expense Entries

Each expense belongs to exactly one snapshot and has:
- **Name** (string, e.g., "Netflix Subscription", "Hotel in Madrid")
- **Amount** (integer, in EUR cents) — must be zero or positive, no negative values
- **Category** (reference to a node in the snapshot's category tree)
- **Recurring** (boolean) — if true, this expense is auto-copied into the next snapshot. The user manually unflags or deletes recurring entries when they are no longer relevant. There is no expiration mechanism.

### 4.4 Income Entries

Each income entry belongs to exactly one snapshot and has:
- **Name** (string, e.g., "Salary", "Tax Refund")
- **Amount** (integer, in EUR cents) — must be zero or positive, no negative values
- **Category** (string, flat — e.g., "Salary", "Refund", "Side Income") — not hierarchical. Free-text with autocomplete from existing categories in the current snapshot.
- **Recurring** (boolean) — if true, this income entry is auto-copied into the next snapshot. The user manually unflags or deletes recurring entries when they are no longer relevant.

**Income category grouping** (where applicable) is **case-insensitive**. The display label uses the casing from the first entry encountered in a group.

### 4.5 Expense Category Tree

Each snapshot has its **own independent category tree** for expenses. Categories are hierarchical with **unlimited nesting depth**. Category names are **case-sensitive** — "Entertainment" and "entertainment" are treated as distinct siblings.

Examples:
```
Services > Entertainment          → Netflix Subscription
Services > Streaming              → Spotify
Housing > Utilities > Electricity → Monthly electricity bill
Other > Vacation > Madrid > Accommodation → Hotel booking
Other > Vacation > Madrid > Flights       → Flight tickets
```

A category is simply a node in a tree. It has a **name** and an optional **parent category** (within the same snapshot).

**Category deletion** is a cascade operation. Deleting a category also deletes all its descendant categories and all expenses assigned to the deleted category or any of its descendants. See §5.3 for confirmation dialog details.

**Empty categories are allowed.** A category with no expenses or children is valid and will persist until explicitly deleted by the user.

---

## 5. Snapshot Lifecycle

### 5.1 Creation (Carry Forward)

When creating a new snapshot for month M:
1. The system verifies no snapshot exists for month M. **Any month/year is allowed** — past, present, or future. There are no date range restrictions.
2. The system finds the **most recent existing snapshot** by year/month ordering (see §3.1). If none exists, skip to step 6.
3. All **account balances** from the previous snapshot are copied as defaults (including `total_paid` values).
4. The **expense category tree** from the previous snapshot is copied. A mapping of `old_category_id → new_category_id` is built during the copy to correctly remap expense references.
5. All **expense entries** marked as `recurring: true` are copied (with the same name, amount, recurring flag, and category remapped to the new snapshot's category tree using the ID mapping from step 4). All **income entries** marked as `recurring: true` are copied (with the same name, amount, category, and recurring flag).
6. If no previous snapshot exists (first ever), the snapshot is created with the default accounts listed in §4.2 and an empty category tree.
7. The user then reviews and edits everything: update account balances, add/remove expenses, adjust amounts, create new categories, etc.

**Carry-forward is a one-time operation at creation time.** Creating a snapshot between two existing snapshots does not retroactively update the later snapshot. Each snapshot's carried-forward data reflects the state of its source snapshot at the moment of creation.

### 5.2 Editing

There is no draft/finalized state. A snapshot is always editable.

**Edit mode and row-level editing:** The snapshot detail view has a **global edit mode toggle**. In read-only mode, all editing affordances are hidden and visualizations are prominent. In edit mode, add/delete buttons appear and each data row (account, expense, income entry) displays an **edit icon**. Clicking the edit icon on a row toggles that row into an inline-editable state. The user makes changes and clicks a **confirm button** (or presses Enter) to save the entire row as a complete unit. If a save fails, a toast notification is shown with the error message.

### 5.3 Deletion

A snapshot can be deleted. This removes all associated accounts, expenses, income, and categories. Confirm with a dialog before deletion.

**Category deletion** is also confirmed with a dialog that displays the **blast radius**: the number of child categories and the number of expenses (with their total EUR amount) that will be cascade-deleted. Example: "This will delete 3 subcategories and 12 expenses totaling €847.50. Are you sure?" The blast radius is retrieved via the `categories.deletePreview` query (see §10) before showing the dialog.

---

## 6. User Interface

### 6.1 Pages

The app has two main views:

#### Dashboard (Home)
- Lists all snapshots in reverse chronological order (most recent first).
- Each row shows: **month/year**, **total net worth**, and **net worth delta** vs. the previous snapshot (see §3.1) with color: green for positive, red for negative.
- A "Create New Snapshot" button that opens a month/year picker. Only months without an existing snapshot are selectable. The picker defaults to the next calendar month after the most recent snapshot.

#### Snapshot Detail View
- The main workspace for a single snapshot.
- Displays all data (accounts, income, expenses, visualizations) on a single page.
- Has a **global edit mode toggle**:
  - **Read-only mode:** Data is not editable, no add/delete buttons visible, no per-row edit icons. Visualizations are prominent — the Sankey diagram is expanded.
  - **Edit mode:** Per-row edit icons, add/delete buttons, and category management controls appear. The Sankey diagram is **collapsed behind an expandable section** (since data is actively changing and the diagram would be stale). The net worth summary remains visible at the top in both modes.

### 6.2 Snapshot Detail — Sections

The detail view contains these sections:

#### A. Net Worth Summary
- Displays total net worth = sum of assets − sum of liabilities.
- Shows delta vs. previous snapshot: absolute EUR value always shown. **Percentage is shown only when both the current and previous snapshot have the same sign net worth** (both positive or both negative). When the previous net worth is zero or the sign changes between snapshots, only the absolute delta is displayed — percentage is omitted because it would be undefined or misleading.
- Below the headline: a per-account breakdown comparing current vs. previous snapshot values, with deltas. Accounts are matched by exact name. The union of accounts from both snapshots is shown; accounts present in only one snapshot show €0 for the other side.
- Uses **Recharts** for the comparison chart (grouped bar chart or similar).

#### B. Accounts
- Table of all accounts: name, type, category, balance, and (if applicable) total paid.
- In edit mode: per-row edit/confirm toggle for inline editing. Buttons to add new accounts or remove existing ones.

#### C. Income
- Simple flat list of income entries: name, amount, category, recurring flag.
- No column header sorting. No grouping by category. No subtotals per category.
- In edit mode: per-row edit/confirm toggle for inline editing, add/remove entries.
- The category field provides **autocomplete** suggestions from existing income categories in the current snapshot.
- Shows total income at the bottom.

#### D. Expenses (Tree View)
- Expenses are displayed as a **collapsible tree** structured by the category hierarchy. Categories are the folder nodes; individual expense entries are the leaf items.
- Each category node displays the **sum of all its descendant expenses**.
- Categories are sorted **alphabetically**. Expenses within a category are sorted by **amount descending**.
- The tree is **collapsible** — users can expand/collapse category nodes to focus on sections they care about.
- In edit mode:
  - Each category node has a **"+" button to add a new expense** under that category.
  - Each category node has a **folder "+" button to add a subcategory**.
  - A **"+ New Category" button** at the top of the expense section for creating new top-level categories.
  - Per-row edit/confirm toggle for inline editing of expense name, amount, and recurring flag.
  - Category reassignment via the breadcrumb picker (§6.3).
  - Delete buttons on expenses and categories (category deletion cascades per §5.3).
- Shows total expenses at the bottom.

#### E. Sankey Diagram
- Full-page-width Sankey diagram using **d3-sankey**.
- Left side: income sources flowing in.
- Middle: total income splits into total expenses and savings (income minus expenses).
- Right side: expenses branch through the **full category hierarchy** (all levels shown, no depth limit or collapsing). The Sankey renders the tree as-is.
- **In read-only mode:** expanded and visible by default.
- **In edit mode:** collapsed behind an expandable section.

### 6.3 Category Picker (Breadcrumb-Style)

When adding or editing an expense in edit mode, the category is selected via a breadcrumb-style dropdown:
1. A dropdown shows all top-level categories.
2. Selecting a category shows its children in a next dropdown.
3. This continues until the user reaches the desired depth.
4. At each level, there is a **"+ New"** button to create a new category at that level.
5. The user can select a category at any depth (doesn't have to go to a leaf).

Categories are created on the fly through this picker. There is no separate category management screen. **Creating a category via the picker immediately persists it to the backend and automatically selects it** as the current expense's category. If the user subsequently changes the category or deletes the expense, the empty category remains in the tree until explicitly deleted.

### 6.4 Empty States

Each empty context displays a brief message and a call-to-action:
- **Dashboard with no snapshots:** "No snapshots yet" with a prominent "Create your first snapshot" button.
- **Empty expense tree:** "No expenses yet — switch to edit mode to start adding."
- **Empty income list:** "No income entries yet — switch to edit mode to start adding."
- **Sankey edge cases:** see §7.2.

### 6.5 Error and Loading States

- **API errors** (duplicate snapshot, database failure, validation errors): displayed via **toast notifications** using shadcn/ui's toast component.
- **Loading states**: minimal spinners. Latency is expected to be low on a local network.
- **Saving**: row-level save on confirm/enter for all inline edits. Failed saves show a toast with the error.

---

## 7. Visualizations

### 7.1 Net Worth Comparison

- **Location:** Top of the snapshot detail view. Visible in both read-only and edit modes.
- **Library:** Recharts.
- **Content:**
  - Headline: current net worth, previous net worth, delta (absolute EUR, and percentage only when both snapshots have same-sign net worth), with green/red color coding.
  - Chart: grouped bar chart (or horizontal bar chart) showing each account's value in the current and previous snapshot side by side. Accounts matched by exact name; union of both snapshots shown with €0 for missing accounts.
  - Each account bar pair shows the delta.
  - Assets shown as positive, liabilities as negative.
- **Edge case:** First snapshot has no comparison — show net worth only, with a note that there's no previous snapshot.

### 7.2 Sankey Diagram

- **Location:** Below the expenses section in the snapshot detail view. Expanded in read-only mode, collapsed behind an expandable section in edit mode.
- **Library:** d3-sankey with a React wrapper component.
- **Flow structure:**
  - **Source nodes (left):** One node per income entry, labeled by entry name. No merging by category — each income entry is its own source node.
  - **Center split:** Total income divides into "Expenses" and "Savings."
  - **Expense tree (right):** Full category hierarchy, all levels rendered as-is with no depth limit or collapsing. Flow width is proportional to the EUR amount.
  - **Savings node:** A **terminal sink node** on the right side, positioned at the same level as top-level expense categories. It has no outgoing links. It represents the residual (total income minus total expenses).
- **Interactions:** Hover on a node or link to see the EUR amount and percentage of total.
- **Edge cases:**
  - **No expenses:** Show income flowing entirely into the "Savings" node.
  - **No income:** Show expenses sourced from an **"Unspecified Income"** node (visually distinct — different color/style to indicate it is not real income).
  - **Expenses exceed income (negative savings):** Drop the "Savings" node entirely. Add a **"Deficit"** source node on the left that makes up the difference (total expenses − total income). This node is visually distinct (red/orange tint or dashed border) to indicate it represents drawing from savings or taking on debt. All income entries plus the deficit node flow into the expense tree, keeping all Sankey flows positive.

---

## 8. Numeric and Text Validation

### 8.1 Storage Format

All monetary amounts (account balances, total paid, expense amounts, income amounts) are stored as **integers representing EUR cents**. Example: €1,234.56 is stored as `123456`. This avoids floating-point precision issues.

The SQLite column type is `INTEGER` (not `REAL`).

### 8.2 Numeric Validation Rules

- All amounts must be **zero or positive**. Negative amounts are not allowed. Use the type system (asset vs. liability, income vs. expense) to represent direction.
- Amounts are displayed with **two decimal places** formatted using European locale conventions (`fi-FI` or `de-DE`).

### 8.3 Text Validation Rules

All text fields (account names, expense names, income names, category names, income category strings) are validated as follows:
- **Trimming:** Leading and trailing whitespace is stripped before saving.
- **Maximum length:** 100 characters after trimming.
- **Minimum length:** Must not be empty after trimming.
- **Allowed characters:** Any characters including emoji. No restrictions.
- **Validation location:** Server-side, in the tRPC mutation layer.
- **Error handling:** Validation failures return an error displayed via toast notification.

---

## 9. Data Model (SQLite Schema)

### Tables

#### `snapshots`
| Column     | Type    | Constraints              |
|------------|---------|--------------------------|
| id         | INTEGER | PRIMARY KEY AUTOINCREMENT|
| year       | INTEGER | NOT NULL                 |
| month      | INTEGER | NOT NULL (1-12)          |
| created_at | TEXT    | ISO 8601 timestamp       |
| updated_at | TEXT    | ISO 8601 timestamp       |

UNIQUE constraint on `(year, month)`.

**`updated_at` is updated whenever any child record** (account, expense, income, category) **is created, updated, or deleted.** This is implemented in the tRPC mutation layer (not via database triggers) so it remains explicit and testable.

#### `accounts`
| Column      | Type    | Constraints              |
|-------------|---------|--------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT|
| snapshot_id | INTEGER | FK → snapshots.id, NOT NULL |
| name        | TEXT    | NOT NULL (max 100 chars, trimmed) |
| type        | TEXT    | NOT NULL ("asset" or "liability") |
| category    | TEXT    | NOT NULL (max 100 chars, trimmed) |
| balance     | INTEGER | NOT NULL (EUR cents)     |
| total_paid  | INTEGER | NULLABLE (EUR cents)     |

#### `expense_categories`
| Column      | Type    | Constraints              |
|-------------|---------|--------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT|
| snapshot_id | INTEGER | FK → snapshots.id, NOT NULL |
| name        | TEXT    | NOT NULL (max 100 chars, trimmed) |
| parent_id   | INTEGER | FK → expense_categories.id, NULLABLE (NULL = top-level) |

UNIQUE constraint on `(snapshot_id, parent_id, name)` to prevent duplicate siblings. This is **case-sensitive** — "Entertainment" and "entertainment" are allowed as siblings.

#### `expenses`
| Column      | Type    | Constraints              |
|-------------|---------|--------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT|
| snapshot_id | INTEGER | FK → snapshots.id, NOT NULL |
| name        | TEXT    | NOT NULL (max 100 chars, trimmed) |
| amount      | INTEGER | NOT NULL (EUR cents, >= 0) |
| category_id | INTEGER | FK → expense_categories.id, NOT NULL |
| recurring   | INTEGER | NOT NULL (0 or 1)        |

#### `incomes`
| Column      | Type    | Constraints              |
|-------------|---------|--------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT|
| snapshot_id | INTEGER | FK → snapshots.id, NOT NULL |
| name        | TEXT    | NOT NULL (max 100 chars, trimmed) |
| amount      | INTEGER | NOT NULL (EUR cents, >= 0) |
| category    | TEXT    | NOT NULL (max 100 chars, trimmed) |
| recurring   | INTEGER | NOT NULL (0 or 1)        |

### Cascade Deletes

Deleting a snapshot cascades to all related accounts, expense_categories, expenses, and incomes.

Deleting an expense_category cascades to all descendant categories and all expenses assigned to the deleted category or any of its descendants.

---

## 10. API Design (tRPC)

### Router Structure

```
trpc
├── snapshots
│   ├── list          → GET all snapshots (id, year, month, net worth summary)
│   ├── get           → GET single snapshot with all related data
│   ├── create        → POST new snapshot (triggers carry-forward logic)
│   └── delete        → DELETE snapshot by id
│
├── accounts
│   ├── upsert        → CREATE or UPDATE an account within a snapshot
│   └── delete        → DELETE an account by id
│
├── expenses
│   ├── upsert        → CREATE or UPDATE an expense
│   └── delete        → DELETE an expense by id
│
├── incomes
│   ├── upsert        → CREATE or UPDATE an income entry
│   └── delete        → DELETE an income entry by id
│
├── categories
│   ├── create        → CREATE a new category (name + parent_id + snapshot_id)
│   ├── update        → UPDATE category name
│   ├── deletePreview → GET blast radius for a category deletion (subcategory count, expense count, total amount)
│   └── delete        → DELETE category (cascades to children and expenses)
│
└── dashboard
    └── summary       → GET all snapshots with net worth + deltas (for dashboard view)
```

### Key Behaviors

- **Upsert convention:** All upsert endpoints (`accounts.upsert`, `expenses.upsert`, `incomes.upsert`) use **id-based resolution**. If the request includes an `id`, it is an update to the existing row. If no `id` is provided, it is a create within the given snapshot.
- `snapshots.create` accepts `{ year, month }`. Any year/month combination is allowed (past, present, or future) as long as no snapshot already exists for that month. The server finds the most recent prior snapshot (by year/month ordering) and performs the carry-forward logic: copy accounts, recurring expenses (with category IDs remapped via old→new mapping), recurring incomes, and the full category tree. Returns the new snapshot with all pre-populated data.
- `snapshots.get` returns the full snapshot: accounts, incomes, expenses (with category paths), and the category tree. Also dynamically resolves the previous snapshot and returns its net worth and account balances for comparison.
- `categories.deletePreview` accepts a `categoryId` and returns `{ subcategoryCount: number, expenseCount: number, totalAmount: number }`. It is a read-only query used to populate the confirmation dialog before executing the delete. It is idempotent and does not modify data.
- `categories.delete` cascade-deletes all descendant categories and all expenses assigned to the deleted category or any descendant.
- All mutations update `snapshots.updated_at` for the affected snapshot.
- All mutations return the updated entity.
- All amount fields accept and return integers (EUR cents).
- All text fields are trimmed and validated (non-empty, max 100 characters) server-side. Validation failures return an error.

---

## 11. Project Structure

```
financial-tracker/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts          # SQLite table definitions & migrations
│   │   │   │   └── client.ts          # bun:sqlite client initialization
│   │   │   ├── routers/
│   │   │   │   ├── snapshots.ts
│   │   │   │   ├── accounts.ts
│   │   │   │   ├── expenses.ts
│   │   │   │   ├── incomes.ts
│   │   │   │   ├── categories.ts
│   │   │   │   └── dashboard.ts
│   │   │   ├── services/
│   │   │   │   └── carry-forward.ts   # Carry-forward logic (incl. category ID remapping)
│   │   │   ├── trpc.ts                # tRPC initialization
│   │   │   └── index.ts               # Bun HTTP server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── client/
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/                # shadcn/ui components
│       │   │   ├── dashboard/
│       │   │   │   └── SnapshotList.tsx
│       │   │   ├── snapshot/
│       │   │   │   ├── SnapshotDetail.tsx
│       │   │   │   ├── AccountsSection.tsx
│       │   │   │   ├── IncomeSection.tsx
│       │   │   │   ├── ExpenseTree.tsx
│       │   │   │   └── CategoryPicker.tsx
│       │   │   └── visualizations/
│       │   │       ├── NetWorthComparison.tsx
│       │   │       └── SankeyDiagram.tsx
│       │   ├── lib/
│       │   │   └── trpc.ts            # tRPC client setup
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   └── Snapshot.tsx
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       └── vite.config.ts
│
├── package.json                       # Workspace root
└── README.md
```

---

## 12. Development and Deployment

### Development

Run two processes:
- **Backend:** `bun run dev:server` — starts the Bun backend on port 3001.
- **Frontend:** `bun run dev:client` — starts the Vite dev server on port 5173 with hot module replacement. Vite's proxy config forwards `/trpc` requests to the backend.

### Production

1. `bun run build` — builds the frontend via Vite to a `dist` folder.
2. `bun run start` — starts the Bun server, which serves both the static frontend build and the tRPC API from a single process.

Root `package.json` includes workspace scripts to orchestrate both packages.

---

## 13. Non-Functional Requirements

- **Currency:** EUR only. All amounts are stored as integer cents and displayed in EUR with two decimal places.
- **Locale:** Numbers formatted with European convention (comma for decimal, period for thousands) using `fi-FI` or `de-DE` locale formatting.
- **Authentication:** None.
- **Deployment:** Runs on a home server. Both the Bun backend and the Vite-built frontend are served from the same process (the Bun server serves the static frontend build and the tRPC API).
- **Backup:** The SQLite database is a single file. Backup = copy the file.
- **Browser support:** Modern evergreen browsers (Chrome, Firefox, Safari). No IE/legacy support needed.
- **Responsive design:** Not required. Desktop-first is fine — this is used on a home network, likely from a desktop or laptop.

---

## 14. Out of Scope (Future Enhancements)

These are explicitly **not** part of v1 but may be added later:
- CSV / bank statement import
- Multi-currency support with exchange rates
- Authentication
- Net worth over time line chart (across all snapshots)
- Expense trends over time (category comparison across snapshots)
- Savings rate tracking
- Expense breakdown pie chart / treemap
- Income vs. expenses bar chart
- Snapshot finalization / locking
- Notes or annotations on snapshots
- Mobile-responsive layout
- Data export (CSV, PDF reports)
- Global account registry (persistent account identity across snapshots)
- Drag-and-drop expense reordering or category reassignment
