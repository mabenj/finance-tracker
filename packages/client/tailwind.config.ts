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
        side: 'var(--side)',
        topbar: 'var(--topbar)',
        neutralWash: 'var(--neutral-wash)',
        track: 'var(--track)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          2: 'var(--accent-2)',
          wash: 'var(--accent-wash)',
          ink: 'var(--accent-ink)',
          'ink-hover': 'var(--accent-ink-hover)',
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
        // Text/icon color that sits on a solid semantic fill (white in light,
        // deep navy in dark) — replaces hardcoded text-white on those chips.
        onFill: 'var(--on-fill)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        mark: '6px',
        field: '8px',
        control: '8px',
        card: '12px',
      },
      boxShadow: {
        sheet: 'var(--shadow-sheet)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
} satisfies Config;
