import type { Viewport } from "next";

// Layar operasional staf (POS kasir, OS, Production, Waiter) di tablet/HP:
// zoom dua jari dikunci supaya ketukan cepat tidak memperbesar layar tanpa sengaja.
// Halaman pelanggan memakai viewport default di app/layout.tsx (zoom diizinkan).
export const staffViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#08080b",
  colorScheme: "dark",
};
