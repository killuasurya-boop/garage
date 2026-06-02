"use client";

import { useEffect, useRef, useState } from "react";

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function useCounterAnimation(target: number, durationMs = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutExpo(t);
      setValue(target * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

export function formatNumber(value: number, format?: "currency" | "percent" | "number") {
  if (format === "currency") {
    // Compact rupiah formatting
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + " M";
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + " jt";
    if (value >= 1_000) return (value / 1_000).toFixed(1) + " rb";
    return Math.round(value).toLocaleString("id-ID");
  }
  if (format === "percent") return value.toFixed(1);
  return Math.round(value).toLocaleString("id-ID");
}
