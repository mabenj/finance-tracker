// Theme system: a manual light/dark toggle that defaults to the OS preference
// on first load, then remembers the user's choice in localStorage. The resolved
// theme is reflected as `data-theme` on <html>; every color token in index.css
// keys off that attribute. An inline script in index.html applies it before
// first paint (no flash) — this provider keeps React in sync afterwards.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

// Recharts sets SVG fills/strokes from JS and can't read CSS variables, so the
// chart colors are mirrored here per theme. Keep in sync with index.css tokens.
export const chartPalette: Record<
  Theme,
  { current: string; previous: string; grid: string; axis: string; zero: string; legend: string }
> = {
  light: {
    current: '#26457a', // --accent
    previous: '#9aa3b2', // muted slate, subordinate to current
    grid: '#e6e9ee', // --rule
    axis: '#5b6472', // --ink-muted
    zero: '#c9ced6', // --rule-strong
    legend: '#5b6472', // --ink-muted
  },
  dark: {
    current: '#6f9ae0', // --accent (dark)
    previous: '#7c88a8', // lighter slate, subordinate to current
    grid: '#2a3242', // --rule (dark)
    axis: '#a2acbd', // --ink-muted (dark)
    zero: '#3a4356', // --rule-strong (dark)
    legend: '#a2acbd', // --ink-muted (dark)
  },
};

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable — fall through to OS preference */
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* persistence is best-effort */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
