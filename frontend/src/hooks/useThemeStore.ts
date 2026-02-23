import { create } from "zustand";

const STORAGE_KEY = "lakestream-theme";

interface ThemeState {
  theme: "light" | "dark";
  toggleTheme: () => void;
  initTheme: () => void;
}

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    set({ theme: next });
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  },
  initTheme: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null;
    const theme = stored === "light" || stored === "dark" ? stored : getSystemPreference();
    set({ theme });
    applyTheme(theme);
  },
}));
