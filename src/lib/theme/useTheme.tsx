// Palms is dark-only. EasyUI components read the theme through this hook,
// so it always reports "dark"; the `dark` class is set statically in index.html.
export type Theme = 'dark';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const DARK: ThemeContextValue = { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };

export function useTheme(): ThemeContextValue {
  return DARK;
}
