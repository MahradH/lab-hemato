import { Layers, ListChecks, Microscope, Moon, Sun } from "lucide-react";
import type { Mode } from "../types";
import type { Theme } from "../hooks/useTheme";

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ mode, onModeChange, theme, onToggleTheme }: HeaderProps) {
  const themeLabel = theme === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تاریک";

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Microscope size={24} strokeWidth={1.7} />
          </span>
          <div className="brand-text">
            <h1>فلش‌کارت هماتولوژی</h1>
            <p>مرور تصویری یافته‌های مورفولوژیک خون</p>
          </div>
        </div>

        <div className="header-controls">
          <nav className="segmented" aria-label="حالت مطالعه">
            <button
              type="button"
              aria-pressed={mode === "flashcards"}
              onClick={() => onModeChange("flashcards")}
            >
              <Layers size={16} aria-hidden="true" />
              فلش‌کارت
            </button>
            <button
              type="button"
              aria-pressed={mode === "quiz"}
              onClick={() => onModeChange("quiz")}
            >
              <ListChecks size={16} aria-hidden="true" />
              آزمون
            </button>
          </nav>

          <button
            type="button"
            className="icon-button"
            onClick={onToggleTheme}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {theme === "dark" ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
