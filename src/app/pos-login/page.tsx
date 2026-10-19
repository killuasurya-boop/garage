import type { Metadata } from "next";
import { LazyGaragePosLogin } from "@/components/garage/garage-app-loader";
import { staffViewport } from "@/lib/staff-viewport";

// Layar staf: zoom dua jari dikunci (lihat src/lib/staff-viewport.ts).
export const viewport = staffViewport;

export const metadata: Metadata = {
  title: "Masuk · POS Garage",
  description: "Halaman khusus login tablet POS Garage Coffee.",
};

export default function PosLoginPage() {
  // Kasir langsung ke POS setelah masuk (sesuai teks di kartu login).
  return <LazyGaragePosLogin returnTo="/pos" />;
}
