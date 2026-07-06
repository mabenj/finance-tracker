import { IconButton } from './IconButton';
import { IconMoon, IconSun } from './icons';
import { useTheme } from '../../lib/theme';
import { t } from '../../lib/strings';

// Header control that flips the light/dark theme. Shows the icon of the theme
// you'd switch *to*, with an aria-label describing the action.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const goingDark = theme === 'light';
  return (
    <IconButton
      tone="muted"
      onClick={toggle}
      aria-label={goingDark ? t.switchToDark : t.switchToLight}
      title={goingDark ? t.switchToDark : t.switchToLight}
      className={className}
    >
      {goingDark ? <IconMoon /> : <IconSun />}
    </IconButton>
  );
}
