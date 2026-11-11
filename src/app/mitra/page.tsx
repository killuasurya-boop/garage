import type { Metadata } from "next";

import { PartnerLanding } from "@/components/garage/partner-public/partner-landing";

export const metadata: Metadata = {
  title: "Jadi Mitra Garage Coffee | Titip Jual Produk Anda",
  description:
    "Garage Coffee Tebing Tinggi membuka kerja sama mitra resmi: es krim, dimsum, dessert, dan kuliner lain dijual di kasir & waiter Garage, laporan transparan, setoran terjadwal. Daftar online.",
  alternates: { canonical: "/mitra" },
  openGraph: {
    title: "Jadi Mitra Garage Coffee",
    description: "Tawarkan produk Anda untuk dijual di Garage Coffee. Laporan transparan, setoran terjadwal.",
    type: "website",
    locale: "id_ID",
  },
};

export default function MitraPage() {
  return <PartnerLanding />;
}
