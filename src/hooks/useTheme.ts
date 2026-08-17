import { useEffect, useState } from "react";

const KEY = "vizin_theme";
export type Theme = "light" | "dark";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(KEY) as Theme) || "light";
  });
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, setTheme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

// Apply saved theme ASAP on client boot (import once in root).
export function initTheme() {
  if (typeof window === "undefined") return;
  try {
    const t = (localStorage.getItem(KEY) as Theme) || "light";
    applyTheme(t);
  } catch {
    /* ignore */
  }
}
