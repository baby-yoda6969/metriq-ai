import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY, THEMES } from "./theme.js";

const ThemeContext = createContext({
  mode: "dark",
  colors: THEMES.dark,
  setMode: () => {},
  toggle: () => {},
});

function readStoredMode() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.style.colorScheme = mode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[mode].bg);
  }, [mode]);

  const value = useMemo(() => {
    const colors = THEMES[mode] || THEMES.dark;
    return {
      mode,
      colors,
      setMode: (next) => {
        if (next === "light" || next === "dark") setModeState(next);
      },
      toggle: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
    };
  }, [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
