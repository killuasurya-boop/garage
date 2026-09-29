"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const idNumber = new Intl.NumberFormat("id-ID");

/** Rp2.850.000 */
export function rupiah(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${idNumber.format(Math.abs(Math.round(value)))}`;
}

/** Rp2,85 jt / Rp850 rb / Rp1,2 M — untuk sumbu grafik & ruang sempit. */
export function rupiahShort(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fmt = (n: number, digits: number) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(n);
  if (abs >= 1_000_000_000) return `${sign}Rp${fmt(abs / 1_000_000_000, 2)} M`;
  if (abs >= 1_000_000) return `${sign}Rp${fmt(abs / 1_000_000, 2)} jt`;
  if (abs >= 1_000) return `${sign}Rp${fmt(abs / 1_000, 0)} rb`;
  return `${sign}Rp${fmt(abs, 0)}`;
}

export function axisShort(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}rb`;
  return `${sign}${abs}`;
}

export function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value)}%`;
}

export function signedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${percent(value)}`;
}

/** Count-up 750 ms (PRD §22), dimatikan bila prefers-reduced-motion. */
export function useCountUp(target: number, durationMs = 750) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    let frame = 0;
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / durationMs);
      const next = from + (target - from) * ease(t);
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = target;
    };
  }, [target, durationMs, reduce]);

  return reduce ? target : value;
}
