"use client";

import { useEffect, useRef, useState } from "react";

// Langganan SSE /api/production/stream. Memanggil onChange (debounce 500 ms)
// tiap ada perubahan produksi. `connected` dipakai untuk memperlambat polling
// cadangan; bila koneksi putus, EventSource mencoba ulang sendiri.
export function useProductionStream(onChange: () => void, enabled = true) {
  const [connected, setConnected] = useState(false);
  const callback = useRef(onChange);

  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource("/api/production/stream");
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("change", () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => callback.current(), 500);
    });
    source.onerror = () => setConnected(false);
    return () => {
      if (debounce) clearTimeout(debounce);
      source.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
