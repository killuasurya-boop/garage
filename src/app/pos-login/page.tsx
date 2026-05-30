import type { Metadata } from "next";
import { LazyGaragePosLogin } from "@/components/garage/garage-app-loader";

export const metadata: Metadata = {
  title: "Garage POS Login",
  description: "Halaman khusus login tablet POS Garage Coffee & Motor.",
};

export default function PosLoginPage() {
  return <LazyGaragePosLogin />;
}
