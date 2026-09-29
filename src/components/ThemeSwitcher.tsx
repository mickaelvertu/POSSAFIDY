import { Sparkles, Sun, Moon } from "lucide-react";
import { THEME_OPTIONS, useTheme } from "../context/ThemeContext";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const icons = { sandstone: Sun, graphite: Moon, aurora: Sparkles } as const;

  return (
    <div className="theme-switcher inline-flex items-center gap-0.5 rounded-xl border p-1 transition-colors" aria-label="Choisir le thème visuel">
      {THEME_OPTIONS.map(option => {
        const Icon = icons[option.id as keyof typeof icons];
        const isSelected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            title={`${option.label} · ${option.accent}`}
            aria-label={`Thème ${option.label}`}
            aria-pressed={isSelected}
            onClick={() => setTheme(option.id)}
            className={`rounded-lg p-1.5 transition-all ${isSelected ? "theme-switcher-active shadow-sm" : "opacity-60 hover:opacity-100"}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
