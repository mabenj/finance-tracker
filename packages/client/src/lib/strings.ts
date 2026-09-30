// All user-facing Finnish UI copy lives here so it can be proofread in one place.
// Dynamic strings are functions; everything else is a plain string.
// (Server-side error messages are intentionally NOT translated — they surface
// rarely and stay English on the server.)

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// Shared by the headline monthly figures and the Sankey diagram's residual node.
const SURPLUS = "Ylijäämä";
const DEFICIT = "Alijäämä";

export const t = {
  // ── Shared / generic ──────────────────────────────────────────────
  cancel: "Peruuta",
  delete: "Poista",
  deleting: "Poistetaan…",
  save: "Tallenna",
  saving: "Tallennetaan…",
  add: "Lisää",
  edit: "Muokkaa",
  confirm: "Vahvista",
  moveUp: "Siirrä ylös",
  moveDown: "Siirrä alas",
  done: "Valmis",
  loading: "Ladataan…",
  category: "Kategoria",
  name: "Nimi",
  amount: "Summa",
  recurring: "Toistuva",
  recurrenceFixed: "Kiinteä",
  recurrenceVariable: "Muuttuva",
  recurrenceFixedTooltip: "Kiinteä toistuva",
  recurrenceVariableTooltip: "Muuttuva toistuva",
  // Ghost hint on carried variable rows: "ed. kk" = edellinen kuukausi (last month).
  carriedHint: (amount: string) => `ed. kk ${amount}`,
  carriedHintTooltip: "Summa edellisessä kuukausikatsauksessa",
  total: "Yhteensä",
  selectPlaceholder: "— valitse —",
  addNew: "+ Uusi…",

  // ── Dashboard ─────────────────────────────────────────────────────
  dashboardTitle: "Kuukausikatsaukset",
  newSnapshot: "Uusi kuukausikatsaus",
  newSnapshotDialogTitle: "Uusi kuukausikatsaus",
  year: "Vuosi",
  monthExistsSuffix: " (on jo olemassa)",
  create: "Luo katsaus",
  creating: "Luodaan…",
  snapshotExists: (monthYear: string) =>
    `Kuukausikatsaus ${monthYear} on jo olemassa.`,

  // ── Snapshot list ─────────────────────────────────────────────────
  month: "Kuukausi",
  change: "Muutos",
  noSnapshots: "Ei kuukausikatsauksia vielä",
  noSnapshotsHint:
    "Aloita seuraamaan varallisuuttasi luomalla ensimmäinen kuukausikatsaus.",
  createFirstSnapshot: "Luo ensimmäinen kuukausikatsaus",
  deleteSnapshotTitle: "Poistetaanko kuukausikatsaus?",
  deleteSnapshotBody: (monthYear: string) =>
    `Tämä poistaa pysyvästi kuukausikatsauksen ${monthYear} sekä kaikki sen tilit, tulot ja menot.`,

  // ── Snapshot page ─────────────────────────────────────────────────
  snapshotNotFound: "Kuukausikatsausta ei löytynyt.",
  backToDashboard: "Takaisin etusivulle",
  dashboardLink: "Etusivu",
  viewMode: "Katselutila",
  editMode: "Muokkaustila",
  switchToDark: "Vaihda tummaan tilaan",
  switchToLight: "Vaihda vaaleaan tilaan",

  // ── Accounts ──────────────────────────────────────────────────────
  accounts: "Tilit",
  addAccount: "Lisää tili",
  accountName: "Tilin nimi",
  type: "Tyyppi",
  balance: "Saldo",
  totalPaid: "Maksettu yhteensä",
  accountType: { asset: "Vara", liability: "Velka" } as Record<string, string>,
  noAccounts: "Ei tilejä vielä — siirry muokkaustilaan lisätäksesi.",
  deleteAccountTitle: "Poistetaanko tili?",
  deleteAccountBody: "Tämä poistaa tilin pysyvästi tästä kuukausikatsauksesta.",
  invalidBalance: "Virheellinen saldo — syötä kokonaisina euroina",
  invalidTotalPaid: "Virheellinen maksettu summa — syötä kokonaisina euroina",

  // ── Income ────────────────────────────────────────────────────────
  income: "Tulot",
  addIncome: "Lisää tulo",
  incomeName: "Tulon nimi",
  noIncomeEdit: 'Ei tuloja vielä — lisää klikkaamalla "+ Lisää tulo" yltä.',
  noIncomeView: "Ei tuloja vielä — siirry muokkaustilaan lisätäksesi.",
  deleteIncomeTitle: "Poistetaanko tulo?",
  deleteEntryBody:
    "Tämä poistaa merkinnän pysyvästi tästä kuukausikatsauksesta.",
  invalidAmount: "Virheellinen summa — syötä kokonaisina euroina",

  // ── Expenses ──────────────────────────────────────────────────────
  expenses: "Menot",
  totalExpenses: "Menot yhteensä",
  expenseName: "Menon nimi",
  categoryLabel: "Kategoria:",
  nameRequired: "Nimi on pakollinen",
  amountNonNegative: "Summan on oltava nolla tai positiivinen",
  expandCategory: "Laajenna kategoria",
  collapseCategory: "Tiivistä kategoria",
  expandAll: "Laajenna kaikki",
  collapseAll: "Tiivistä kaikki",
  emptyCategory: "tyhjä",
  addExpense: "Lisää meno",
  addExpenseShort: "+ Meno",
  addSubcategory: "Lisää alakategoria",
  addSubcategoryShort: "+ Alakategoria",
  rename: "Nimeä uudelleen",
  adjust: "Muuta summaa",
  adjustPlaceholder: "+/−",
  adjustApply: "Käytä",
  subcategoryName: "Alakategorian nimi",
  newCategory: "Uusi kategoria",
  newCategoryName: "Uuden kategorian nimi",
  noExpensesView: "Ei menoja vielä — siirry muokkaustilaan lisätäksesi.",
  noCategories: "Ei kategorioita vielä — lisää yksi alta.",
  deleteCategoryTitle: "Poistetaanko kategoria?",
  deletePreviewError:
    "Poiston esikatselua ei voitu ladata. Sulje ja yritä uudelleen.",
  deleteEmptyCategory: "Poistetaanko tämä tyhjä kategoria?",
  deleteCategoryBody: (
    subcategoryCount: number,
    expenseCount: number,
    amount: string
  ) => {
    const subs =
      subcategoryCount > 0
        ? `${subcategoryCount} ${plural(
            subcategoryCount,
            "alakategorian",
            "alakategoriaa"
          )} ja `
        : "";
    const exps = `${expenseCount} ${plural(expenseCount, "menon", "menoa")}`;
    return `Tämä poistaa ${subs}${exps}, yhteensä ${amount}. Oletko varma?`;
  },

  // ── Net worth ─────────────────────────────────────────────────────
  netWorth: "Nettovarallisuus",
  vs: "vs",
  noPreviousSnapshot: "Ei edellistä kuukausikatsausta",

  // ── Monthly figures (headline; Tulot/Menot reuse `income`/`expenses`) ──
  surplus: SURPLUS,
  deficit: DEFICIT,

  // ── Sankey ────────────────────────────────────────────────────────
  sankeyHeading: "Tulo- ja menovirrat",
  sankeyHeadingCollapsible: "Tulo- ja menovirrat (Sankey)",
  sankeyNoData: "Ei tietoja Sankey-kaaviossa.",
  // Sankey node display labels (the diagram's IDs stay English; only labels are localized).
  sankeyUnspecifiedIncome: "Erittelemätön tulo",
  sankeyDeficit: DEFICIT,
  sankeySurplus: SURPLUS,
  sankeyBudget: "Budjetti",
};
