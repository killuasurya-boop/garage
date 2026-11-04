"use client";

// Favorit pelanggan (Menu V5, papan 01 & layout): disimpan per perangkat di localStorage, tanpa login dan tanpa
// server. Penyimpanan diblokir (mode privat) → favorit hanya bertahan selama halaman terbuka.
import { useCallback, useSyncExternalStore } from "react";

const KEY = "garage:menu-favorites";
const EVENT = "garage:menu-favorites-changed";
const EMPTY: readonly string[] = [];

let memory: readonly string[] | null = null;

function read(): readonly string[] {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    memory = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function write(next: readonly string[]) {
  memory = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Diblokir: tetap di memori.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      memory = null;
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tambah/hapus favorit (murni, untuk diuji). */
export function toggleFavoriteIds(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [id, ...ids].slice(0, 200);
}

export function useMenuFavorites() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((id: string) => write(toggleFavoriteIds(read(), id)), []);
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
