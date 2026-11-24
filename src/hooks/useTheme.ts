import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

function initialTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem("hemato.theme", theme);
    } catch {
      // Persisting the theme is best-effort.
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#0e1412" : "#f6f4ef");
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
