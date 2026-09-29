import type { Metadata } from "next";
import { LazyGaragePosLogin } from "@/components/garage/garage-app-loader";
import { staffViewport } from "@/lib/staff-viewport";

// Layar staf: zoom dua jari dikunci (lihat src/lib/staff-viewport.ts).
export const viewport = staffViewport;

export const metadata: Metadata = {
  title: "Garage POS Login",
  description: "Halaman khusus login tablet POS Garage Coffee & Motor.",
};

export default function PosLoginPage() {
  return <LazyGaragePosLogin />;
}
