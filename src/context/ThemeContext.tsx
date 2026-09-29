import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type AppTheme = "aurora" | "graphite" | "ocean" | "sandstone";

export const THEME_OPTIONS: Array<{ id: AppTheme; label: string; accent: string }> = [
  { id: "sandstone", label: "Jour", accent: "Safran" },
  { id: "graphite", label: "Nuit", accent: "Cuivre" },
  { id: "aurora", label: "Aurora", accent: "Émeraude" }
];

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "gileada-theme";

function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "aurora";
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  return THEME_OPTIONS.some(option => option.id === storedTheme) ? storedTheme as AppTheme : "aurora";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
