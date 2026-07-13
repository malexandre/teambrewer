import { useTheme } from "@/app/theme";
import { Button } from "@/components/ui/button";

const THEME_ORDER = ["light", "dark", "system"] as const;
const THEME_LABEL: Record<(typeof THEME_ORDER)[number], string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Cycles the color theme (light → dark → system). The ThemeProvider already
 * exists; this is the missing user-facing control (phase-13 a11y/theming pass).
 * Labeled for screen readers with both the current mode and the next action.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Modulo keeps the index in range; the ?? satisfies noUncheckedIndexedAccess.
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? "system";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[nextTheme]}.`}
      title={`Theme: ${THEME_LABEL[theme]}`}
    >
      {THEME_LABEL[theme]}
    </Button>
  );
}
