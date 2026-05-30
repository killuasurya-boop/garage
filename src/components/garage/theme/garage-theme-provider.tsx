"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearStoredTheme,
  completeGarageTheme,
  defaultTheme,
  loadStoredTheme,
  persistTheme,
  themeFromPreset,
  themeToCssVars,
  type GarageTheme,
  type ThemeColorTokens,
  type ThemeUITokens,
} from "@/lib/garage-theme";

type ThemeContextValue = {
  theme: GarageTheme;
  setPreset: (presetId: string) => void;
  setColor: (key: keyof ThemeColorTokens, value: string) => void;
  setUI: <K extends keyof ThemeUITokens>(key: K, value: ThemeUITokens[K]) => void;
  setTheme: (theme: GarageTheme) => void;
  resetTheme: () => void;
};

const GarageThemeContext = createContext<ThemeContextValue | null>(null);

export function GarageThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<GarageTheme>(() => defaultTheme());
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate localStorage state setelah mount; SSR tidak punya akses storage. */
  useEffect(() => {
    const stored = loadStoredTheme();
    if (stored) {
      setThemeState(stored);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Apply CSS variables ke <html> setiap kali theme berubah.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = themeToCssVars(theme);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    if (hydrated) persistTheme(theme);
  }, [theme, hydrated]);

  const setPreset = useCallback((presetId: string) => {
    setThemeState(themeFromPreset(presetId));
  }, []);

  const setColor = useCallback((key: keyof ThemeColorTokens, value: string) => {
    setThemeState((prev) => completeGarageTheme({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  }, []);

  const setUI = useCallback(
    <K extends keyof ThemeUITokens>(key: K, value: ThemeUITokens[K]) => {
      setThemeState((prev) => completeGarageTheme({
        ...prev,
        ui: { ...prev.ui, [key]: value },
      }));
    },
    [],
  );

  const resetTheme = useCallback(() => {
    clearStoredTheme();
    setThemeState(defaultTheme());
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setPreset,
      setColor,
      setUI,
      setTheme: (nextTheme) => setThemeState(completeGarageTheme(nextTheme)),
      resetTheme,
    }),
    [theme, setPreset, setColor, setUI, resetTheme],
  );

  return (
    <GarageThemeContext.Provider value={value}>{children}</GarageThemeContext.Provider>
  );
}

// Stable fallback — module scope supaya identity konsisten antar render.
const noop = () => {};
const FALLBACK_THEME_VALUE: ThemeContextValue = {
  theme: defaultTheme(),
  setPreset: noop,
  setColor: noop,
  setUI: noop,
  setTheme: noop,
  resetTheme: noop,
};

export function useGarageTheme() {
  const ctx = useContext(GarageThemeContext);
  if (!ctx) {
    // Provider belum mount — fallback default supaya komponen yang baca tema
    // tidak crash dan tidak menyebabkan identity churn yang bikin render loop.
    return FALLBACK_THEME_VALUE;
  }
  return ctx;
}
