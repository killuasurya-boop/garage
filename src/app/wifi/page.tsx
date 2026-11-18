import type { Metadata } from "next";

import { WifiMemberPortal } from "@/components/garage/wifi-member-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WiFi Gratis - Garage Coffee",
  description: "Sambungkan WiFi gratis Garage: masuk cepat atau login member.",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// Halaman login hotspot MikroTik mengarah ke sini:
// /wifi?mac=$(mac)&ip=$(ip)&login=$(link-login-only)&dst=$(link-orig-esc)
export default async function WifiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <WifiMemberPortal
      mac={first(params, "mac")}
      ip={first(params, "ip")}
      loginUrl={first(params, "login")}
      dst={first(params, "dst")}
      welcome={first(params, "welcome") === "guest"}
    />
  );
}
