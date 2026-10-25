import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { MemberLoginPage } from "@/components/garage/member-auth/member-login-page";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Login Member - Garage Coffee",
  description:
    "Pintu masuk member Garage Coffee untuk rewards, promo, dan riwayat kunjungan.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function MemberLoginRoute({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <MemberLoginPage initialReturnTarget={firstParam(params, "next")} fontClassName={inter.variable} />;
}
