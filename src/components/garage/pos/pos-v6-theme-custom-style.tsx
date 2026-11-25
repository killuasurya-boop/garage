"use client";

// Warna/radius kustom tema POS (per perangkat) — selalu dipasang. Dipisah dari Theme Studio supaya dialog
// Theme Studio bisa di-lazy-load (Fase 3 tahap C).
import { useSyncExternalStore } from "react";

import { readThemeCustom, readThemeCustomServer, subscribeThemeCustom, themeCustomCss } from "./pos-v6-theme-custom";

export function PosV6ThemeCustomStyle() {
  const custom = useSyncExternalStore(subscribeThemeCustom, readThemeCustom, readThemeCustomServer);
  const css = themeCustomCss(custom);
  return css ? <style data-pos-theme-custom>{css}</style> : null;
}
