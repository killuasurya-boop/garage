/**
 * Sumber tunggal aset resmi Garage Coffee.
 *
 * Dilarang membuat ulang, mengganti bentuk, recolor, atau memotong logo.
 * Gunakan file PNG asli di public/garage-brand dengan object-contain.
 * Pastikan setiap penggantian aset master telah disetujui Owner.
 */
export const GARAGE_BRAND_ASSETS = {
  wordmark: "/garage-brand/garage-coffee-logo.png",
  wordmarkOnLight: "/garage-brand/garage-coffee-logo-dark.png",
  icon: "/garage-brand/garage-coffee-icon.png",
} as const;

export const GARAGE_BRAND_WORDMARK_SIZE = { width: 1200, height: 282 } as const;
export const GARAGE_BRAND_LOGO_ASPECT =
  GARAGE_BRAND_WORDMARK_SIZE.width / GARAGE_BRAND_WORDMARK_SIZE.height;
