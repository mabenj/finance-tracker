// JS-side mirror of the color tokens defined in src/index.css (:root).
// Recharts sets SVG fills/strokes from JS and can't reliably read CSS variables,
// so chart colors are sourced here. Keep these in sync with index.css.
export const chart = {
  current: '#26457a', // --accent
  previous: '#9aa3b2', // muted slate, subordinate to current
  grid: '#e6e9ee', // --rule
  axis: '#5b6472', // --ink-muted
  zero: '#c9ced6', // --rule-strong
} as const;
