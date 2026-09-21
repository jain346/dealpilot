/* ================================================================
   THEME CONTEXT
   ================================================================ */

import { createContext, useContext } from "react";
import type { Theme } from "../types";

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
    >
      <span className="theme-toggle-icon">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span className="theme-toggle-text">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
