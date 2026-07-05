import type { Config } from 'tailwindcss';

// Tokens are defined once in src/index.css (:root). Here we only map them onto
// Tailwind utilities so components read `bg-sheet`, `text-ink`, `text-accent`,
// `font-mono`, `rounded-card`, `shadow-sheet` — never raw hex values.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        sheet: 'var(--sheet)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          wash: 'var(--accent-wash)',
        },
        gain: {
          DEFAULT: 'var(--gain)',
          hover: 'var(--gain-hover)',
          wash: 'var(--gain-wash)',
        },
        loss: {
          DEFAULT: 'var(--loss)',
          hover: 'var(--loss-hover)',
          wash: 'var(--loss-wash)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
          ink: 'var(--rule-ink)',
        },
      },
      fontFamily: {
        display: ['Spectral', 'Georgia', 'serif'],
        sans: ['"Public Sans Variable"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        mark: '2px',
        field: '4px',
        control: '6px',
        card: '8px',
      },
      boxShadow: {
        sheet: 'var(--shadow-sheet)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
} satisfies Config;
