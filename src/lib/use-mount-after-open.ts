"use client";

import { useState } from "react";

/**
 * false sampai `open` pertama kali true, lalu tetap true. Dipakai untuk dialog POS yang di-lazy-load
 * (Fase 3 tahap C): tidak dirender sebelum dibuka, tapi setelah dibuka sekali tetap terpasang supaya animasi
 * tutup dan isian dialog tidak hilang.
 */
export function useMountAfterFirstOpen(open: boolean) {
  const [mounted, setMounted] = useState(open);
  // Penyesuaian state saat render (pola React resmi), bukan di effect.
  if (open && !mounted) setMounted(true);
  return mounted || open;
}
